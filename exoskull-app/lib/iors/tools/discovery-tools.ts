/**
 * Tool Discovery — allows the agent to search for tools by keyword.
 *
 * Registered in ALL channel filters so the agent can always find
 * the right tool for the job.
 */

import type { ToolDefinition } from "./shared";
import { IORS_EXTENSION_TOOLS } from "./index";
import { getDynamicToolsForTenant } from "./dynamic-handler";
import { logger } from "@/lib/logger";

export const discoveryTools: ToolDefinition[] = [
  {
    definition: {
      name: "discover_tools",
      description:
        "Search available tools by keyword. Returns matching tool names and descriptions. Use when you need to find the right tool for a task.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Search keyword (e.g. 'email', 'calendar', 'code', 'facebook', 'analytics')",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>, tenantId: string) => {
      const query = ((input.query as string) || "").toLowerCase().trim();
      const limit = (input.limit as number) || 10;

      if (!query) {
        return "Podaj słowo kluczowe, np. 'email', 'calendar', 'code'.";
      }

      // Search static tools
      const matches: Array<{
        name: string;
        description: string;
        score: number;
      }> = [];

      for (const tool of IORS_EXTENSION_TOOLS) {
        const name = tool.definition.name.toLowerCase();
        const desc = (tool.definition.description || "").toLowerCase();

        let score = 0;
        if (name.includes(query)) score += 3;
        if (name === query) score += 5;
        if (desc.includes(query)) score += 1;

        // Check individual words in multi-word queries
        const words = query.split(/\s+/);
        for (const word of words) {
          if (word.length < 2) continue;
          if (name.includes(word)) score += 2;
          if (desc.includes(word)) score += 1;
        }

        if (score > 0) {
          matches.push({
            name: tool.definition.name,
            description: (tool.definition.description || "").slice(0, 120),
            score,
          });
        }
      }

      // Search dynamic tools
      try {
        const dynamicTools = await getDynamicToolsForTenant(tenantId);
        for (const tool of dynamicTools) {
          const name = tool.definition.name.toLowerCase();
          const desc = (tool.definition.description || "").toLowerCase();
          let score = 0;
          if (name.includes(query)) score += 3;
          if (desc.includes(query)) score += 1;
          if (score > 0) {
            matches.push({
              name: `dyn_${tool.definition.name}`,
              description: (tool.definition.description || "").slice(0, 120),
              score,
            });
          }
        }
      } catch (err) {
        logger.warn("[DiscoverTools] Dynamic tool search failed:", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Sort by relevance, limit results
      matches.sort((a, b) => b.score - a.score);
      const top = matches.slice(0, limit);

      if (top.length === 0) {
        return `Nie znalazłem narzędzi pasujących do "${input.query}". Spróbuj innego słowa kluczowego.`;
      }

      const result = top
        .map((m) => `**${m.name}** — ${m.description}`)
        .join("\n");

      return `Znaleziono ${top.length} narzędzi dla "${input.query}":\n\n${result}`;
    },
  },
];
