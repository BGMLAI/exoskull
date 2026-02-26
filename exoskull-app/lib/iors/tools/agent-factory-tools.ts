/**
 * Agent Factory Tools — Recursive agent creation and management.
 *
 * Enables any agent to create sub-agents, spawn agents on tasks,
 * create super-agents for coordination, and discover available agents.
 *
 * Hierarchy safety:
 * - Max depth: 10
 * - Max sub-agents per agent: 5 (configurable)
 * - Max total agents per tenant: 200
 * - Temporary agents auto-expire after 24h
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const MAX_DEPTH = 10;
const DEFAULT_MAX_SUB_AGENTS = 5;
const MAX_AGENTS_PER_TENANT = 200;

export const agentFactoryTools: ToolDefinition[] = [
  // ── create_agent ──
  {
    definition: {
      name: "create_agent",
      description:
        "Utwórz nowego specjalistycznego agenta. Agent może mieć rodzica (sub-agent) i dziedziczy kontekst. Limit: 10 poziomów głębokości, 200 agentów per tenant.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa agenta (np. 'Tax Optimizer for Q1')",
          },
          system_prompt: {
            type: "string",
            description: "Pełny system prompt agenta",
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description:
              "Lista umiejętności (np. ['tax_optimization', 'reporting'])",
          },
          tier: {
            type: "number",
            description: "Tier modelu (1=Flash, 2=Haiku, 3=Sonnet, 4=Opus)",
          },
          type: {
            type: "string",
            description:
              "Typ agenta: specialized, learning, temporary (default: specialized)",
          },
          parent_agent_id: {
            type: "string",
            description: "UUID agenta-rodzica (opcjonalne, tworzy sub-agenta)",
          },
        },
        required: ["name", "system_prompt"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const name = input.name as string;
      const systemPrompt = input.system_prompt as string;
      const capabilities = (input.capabilities as string[]) || [];
      const tier = (input.tier as number) || 2;
      const type = (input.type as string) || "specialized";
      const parentAgentId = input.parent_agent_id as string | undefined;

      logger.info("[AgentFactory] create_agent:", {
        name,
        type,
        parentAgentId,
        tenantId,
      });

      try {
        // Check tenant agent count
        const { count: agentCount } = await supabase
          .from("exo_agents")
          .select("id", { count: "exact", head: true })
          .eq("created_by", tenantId);

        if ((agentCount || 0) >= MAX_AGENTS_PER_TENANT) {
          return `Błąd: Osiągnięto limit ${MAX_AGENTS_PER_TENANT} agentów. Usuń niepotrzebnych agentów.`;
        }

        // Calculate depth
        let depth = 0;
        if (parentAgentId) {
          const { data: parent } = await supabase
            .from("exo_agents")
            .select("depth, max_sub_agents, id")
            .eq("id", parentAgentId)
            .single();

          if (!parent) {
            return `Błąd: Agent-rodzic ${parentAgentId} nie istnieje.`;
          }

          depth = (parent.depth || 0) + 1;
          if (depth > MAX_DEPTH) {
            return `Błąd: Maksymalna głębokość hierarchii to ${MAX_DEPTH}. Obecna: ${depth}.`;
          }

          // Check parent's sub-agent limit
          const { count: childCount } = await supabase
            .from("exo_agents")
            .select("id", { count: "exact", head: true })
            .eq("parent_agent_id", parentAgentId);

          const maxSubs = parent.max_sub_agents || DEFAULT_MAX_SUB_AGENTS;
          if ((childCount || 0) >= maxSubs) {
            return `Błąd: Agent-rodzic ma już ${childCount}/${maxSubs} sub-agentów.`;
          }
        }

        // Generate slug
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const { data, error } = await supabase
          .from("exo_agents")
          .upsert(
            {
              name,
              slug: `${slug}-${Date.now().toString(36)}`,
              system_prompt: systemPrompt,
              type,
              tier,
              capabilities,
              description: systemPrompt.slice(0, 500),
              is_global: false,
              active: true,
              auto_generated: true,
              depth,
              parent_agent_id: parentAgentId || null,
              created_by: tenantId,
              personality_config: {
                source: "agent-factory",
                created_by_tenant: tenantId,
                auto_expire:
                  type === "temporary"
                    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    : null,
              },
            },
            { onConflict: "slug" },
          )
          .select("id, slug")
          .single();

        if (error) {
          logger.error("[AgentFactory] Insert failed:", {
            error: error.message,
          });
          return `Błąd tworzenia agenta: ${error.message}`;
        }

        return `Agent "${name}" utworzony pomyślnie.\nID: ${data.id}\nSlug: ${data.slug}\nTyp: ${type}\nGłębokość: ${depth}\n${type === "temporary" ? "Auto-wygasa za 24h." : ""}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[AgentFactory] create_agent error:", { error: msg });
        return `Błąd: ${msg}`;
      }
    },
  },

  // ── spawn_sub_agent ──
  {
    definition: {
      name: "spawn_sub_agent",
      description:
        "Uruchom istniejącego agenta na konkretnym zadaniu. Używa system prompt agenta + task context. Zwraca wynik.",
      input_schema: {
        type: "object" as const,
        properties: {
          agent_id_or_slug: {
            type: "string",
            description: "UUID lub slug agenta do uruchomienia",
          },
          task: {
            type: "string",
            description: "Zadanie do wykonania",
          },
          context: {
            type: "object",
            description: "Dodatkowy kontekst (opcjonalne)",
          },
        },
        required: ["agent_id_or_slug", "task"],
      },
    },
    timeoutMs: 55_000,
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const agentRef = input.agent_id_or_slug as string;
      const task = input.task as string;
      const context = (input.context as Record<string, unknown>) || {};

      logger.info("[AgentFactory] spawn_sub_agent:", {
        agentRef,
        tenantId,
      });

      try {
        // Lookup agent by ID or slug
        let query = supabase
          .from("exo_agents")
          .select("id, name, slug, system_prompt, tier, type");

        // UUID format check
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            agentRef,
          )
        ) {
          query = query.eq("id", agentRef);
        } else {
          query = query.eq("slug", agentRef);
        }

        const { data: agent } = await query.single();
        if (!agent) {
          return `Błąd: Agent "${agentRef}" nie znaleziony.`;
        }

        // Use Anthropic directly with agent's system prompt
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const modelMap: Record<number, string> = {
          1: "claude-haiku-4-5-20251001",
          2: "claude-haiku-4-5-20251001",
          3: "claude-sonnet-4-6",
          4: "claude-sonnet-4-6",
        };

        const response = await client.messages.create({
          model: modelMap[agent.tier] || "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: agent.system_prompt,
          messages: [
            {
              role: "user",
              content: `Task: ${task}\n\nContext: ${JSON.stringify(context)}`,
            },
          ],
        });

        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => ("text" in b ? b.text : ""))
          .join("");

        return `[Agent: ${agent.name}]\n\n${text}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[AgentFactory] spawn_sub_agent error:", { error: msg });
        return `Błąd: ${msg}`;
      }
    },
  },

  // ── create_super_agent ──
  {
    definition: {
      name: "create_super_agent",
      description:
        "Utwórz agenta koordynującego (super-agent) dla grupy istniejących agentów. Koordynator zna swoich podwładnych i zarządza ich pracą.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa super-agenta",
          },
          child_agent_ids: {
            type: "array",
            items: { type: "string" },
            description: "UUID agentów do koordynowania",
          },
          coordination_prompt: {
            type: "string",
            description:
              "Dodatkowe instrukcje koordynacji (opcjonalne, domyślny prompt będzie wygenerowany)",
          },
        },
        required: ["name", "child_agent_ids"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const name = input.name as string;
      const childIds = input.child_agent_ids as string[];
      const coordPrompt = (input.coordination_prompt as string) || "";

      logger.info("[AgentFactory] create_super_agent:", {
        name,
        childCount: childIds.length,
        tenantId,
      });

      try {
        // Fetch child agents
        const { data: children } = await supabase
          .from("exo_agents")
          .select("id, name, slug, capabilities, type, tier")
          .in("id", childIds);

        if (!children || children.length === 0) {
          return "Błąd: Nie znaleziono żadnych agentów o podanych ID.";
        }

        // Build coordination system prompt
        const childList = children
          .map(
            (c) =>
              `- ${c.name} (${c.slug}): ${(c.capabilities || []).join(", ")} [tier ${c.tier}]`,
          )
          .join("\n");

        const systemPrompt = `You are ${name}, a coordination agent managing a team of specialized agents.

## Your Team
${childList}

## Coordination Rules
1. Analyze incoming tasks and delegate to the most appropriate team member(s)
2. Break complex tasks into sub-tasks for parallel execution
3. Synthesize results from multiple agents into coherent responses
4. Escalate when no team member can handle a request
5. Track task completion and report progress

${coordPrompt ? `## Additional Instructions\n${coordPrompt}` : ""}

Use the spawn_sub_agent tool to delegate work to your team members.`;

        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const { data, error } = await supabase
          .from("exo_agents")
          .insert({
            name,
            slug: `${slug}-${Date.now().toString(36)}`,
            system_prompt: systemPrompt,
            type: "core",
            tier: 3,
            capabilities: ["coordination", "delegation", "synthesis"],
            description: `Super-agent coordinating: ${children.map((c) => c.name).join(", ")}`,
            is_global: false,
            active: true,
            auto_generated: true,
            depth: 0,
            created_by: tenantId,
            personality_config: {
              source: "agent-factory",
              role: "super-agent",
              child_agents: childIds,
            },
          })
          .select("id, slug")
          .single();

        if (error) {
          logger.error("[AgentFactory] Super-agent insert failed:", {
            error: error.message,
          });
          return `Błąd: ${error.message}`;
        }

        // Update children to point to this super-agent as parent
        await supabase
          .from("exo_agents")
          .update({ parent_agent_id: data.id })
          .in("id", childIds);

        return `Super-agent "${name}" utworzony.\nID: ${data.id}\nKoordynuje ${children.length} agentów: ${children.map((c) => c.name).join(", ")}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[AgentFactory] create_super_agent error:", {
          error: msg,
        });
        return `Błąd: ${msg}`;
      }
    },
  },

  // ── list_agents ──
  {
    definition: {
      name: "list_agents",
      description:
        "Lista dostępnych agentów z filtrami. Zwraca name, slug, type, tier, capabilities. Można filtrować po type, capabilities, parent_id.",
      input_schema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            description:
              "Filtruj po type (core, specialized, personal, business, creative)",
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description:
              "Filtruj po capabilities (agent musi mieć DOWOLNĄ z wymienionych)",
          },
          parent_id: {
            type: "string",
            description: "Filtruj po parent_agent_id (sub-agenci)",
          },
          limit: {
            type: "number",
            description: "Limit wyników (default: 20)",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      _tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const type = input.type as string | undefined;
      const capabilities = input.capabilities as string[] | undefined;
      const parentId = input.parent_id as string | undefined;
      const limit = Math.min((input.limit as number) || 20, 50);

      let query = supabase
        .from("exo_agents")
        .select("name, slug, type, tier, capabilities, depth, active")
        .eq("active", true)
        .order("tier", { ascending: true })
        .limit(limit);

      if (type) query = query.eq("type", type);
      if (parentId) query = query.eq("parent_agent_id", parentId);
      if (capabilities && capabilities.length > 0) {
        query = query.overlaps("capabilities", capabilities);
      }

      const { data, error } = await query;

      if (error) {
        return `Błąd: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return "Brak agentów spełniających kryteria.";
      }

      return data
        .map(
          (a) =>
            `${a.name} (${a.slug})\n  type: ${a.type} | tier: ${a.tier} | depth: ${a.depth || 0}\n  capabilities: ${(a.capabilities || []).join(", ")}`,
        )
        .join("\n\n");
    },
  },
];
