/**
 * v3 Self-Evolution Tools — Phase 7
 *
 * 2 tools: get_capabilities, reflexion_evaluate
 *
 * Self-awareness: agent knows what it can and can't do.
 * Reflexion: evaluate outcomes and learn from them.
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 get_capabilities — self-awareness: what can I do?
// ============================================================================

const getCapabilitiesTool: V3ToolDefinition = {
  definition: {
    name: "get_capabilities",
    description:
      "Sprawdź co potrafię (i czego NIE potrafię). Self-awareness. Użyj gdy user pyta 'co umiesz?' lub gdy planujesz złożoną akcję.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_dynamic: {
          type: "boolean",
          description: "Dołącz dynamicznie dodane narzędzia (self_extend)",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      // Static capabilities from tool registry
      const { V3_TOOLS } = await import("./index");
      const staticTools = V3_TOOLS.map((t) => t.definition.name);

      // Dynamic tools from organism_knowledge
      let dynamicTools: string[] = [];
      if (input.include_dynamic) {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const { data } = await supabase
          .from("exo_organism_knowledge")
          .select("content")
          .eq("tenant_id", tenantId)
          .eq("category", "dynamic_tool");

        dynamicTools = (data || []).map((d: { content: string }) => {
          try {
            const parsed = JSON.parse(d.content);
            return `${parsed.name}${parsed.approved ? " ✅" : " ⏳"}`;
          } catch {
            return "?";
          }
        });
      }

      // Known limitations
      const limitations = [
        "Nie mogę bezpośrednio edytować plików na dysku usera (potrzebuję VPS executor)",
        "Nie mogę wydawać pieniędzy bez zatwierdzenia usera",
        "Nie mogę usuwać danych bez 3x potwierdzenia",
        "Nie mogę diagnozować chorób ani problermów psychicznych",
        "Rozmowy telefoniczne wymagają aktywnego Twilio",
        "Budowanie app wymaga ANTHROPIC_API_KEY",
      ];

      // Learned patterns (capabilities discovered through experience)
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      const { data: patterns } = await supabase
        .from("exo_organism_knowledge")
        .select("content, category, confidence")
        .eq("tenant_id", tenantId)
        .in("category", ["pattern", "anti_pattern"])
        .gte("confidence", 0.6)
        .order("confidence", { ascending: false })
        .limit(10);

      const learnedPatterns = (patterns || [])
        .map(
          (p: { content: string; category: string; confidence: number }) =>
            `${p.category === "anti_pattern" ? "🍋" : "🍯"} ${p.content.slice(0, 100)} (${Math.round(p.confidence * 100)}%)`,
        )
        .join("\n");

      return `## Moje Capability

### Narzędzia (${staticTools.length} wbudowanych)
${staticTools.map((t) => `- ${t}`).join("\n")}
${dynamicTools.length ? `\n### Dynamiczne (${dynamicTools.length})\n${dynamicTools.map((t) => `- ${t}`).join("\n")}` : ""}

### Ograniczenia
${limitations.map((l) => `- ${l}`).join("\n")}

### Nauczone wzorce
${learnedPatterns || "Jeszcze niczego nie nauczyłem się z doświadczenia."}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #2 reflexion_evaluate — evaluate an outcome and learn from it
// ============================================================================

const reflexionEvaluateTool: V3ToolDefinition = {
  definition: {
    name: "reflexion_evaluate",
    description:
      "Oceń wynik akcji i wyciągnij wnioski (Sweet & Sour). Użyj po każdej ważnej akcji — sukces → wzorzec, porażka → anty-wzorzec. System uczy się z KAŻDEGO doświadczenia.",
    input_schema: {
      type: "object" as const,
      properties: {
        action_description: {
          type: "string",
          description: "Co zostało zrobione",
        },
        outcome: {
          type: "string",
          enum: ["success", "partial", "failure"],
          description: "Wynik",
        },
        what_worked: { type: "string", description: "Co zadziałało (sweet)" },
        what_failed: {
          type: "string",
          description: "Co nie zadziałało (sour)",
        },
        strategy_change: {
          type: "string",
          description: "Jak zmienić strategię następnym razem",
        },
        goal_id: { type: "string", description: "Cel powiązany" },
      },
      required: ["action_description", "outcome"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const inserts = [];

      // Store sweet pattern
      if (input.what_worked) {
        inserts.push({
          tenant_id: tenantId,
          content: `[${input.action_description}] ${input.what_worked}`,
          category: "pattern",
          confidence: input.outcome === "success" ? 0.8 : 0.5,
          source: "reflexion",
        });
      }

      // Store sour anti-pattern
      if (input.what_failed) {
        inserts.push({
          tenant_id: tenantId,
          content: `[${input.action_description}] ${input.what_failed}${input.strategy_change ? ` → ${input.strategy_change}` : ""}`,
          category: "anti_pattern",
          confidence: input.outcome === "failure" ? 0.8 : 0.4,
          source: "reflexion",
        });
      }

      if (inserts.length > 0) {
        await supabase.from("exo_organism_knowledge").insert(inserts);
      }

      // Log reflexion event
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "reflexion",
        payload: {
          action: input.action_description,
          outcome: input.outcome,
          sweet: input.what_worked || null,
          sour: input.what_failed || null,
          strategy_change: input.strategy_change || null,
          goal_id: input.goal_id || null,
        },
      });

      const emoji =
        input.outcome === "success"
          ? "🍯"
          : input.outcome === "failure"
            ? "🍋"
            : "📊";
      return `${emoji} Refleksja zapisana: "${(input.action_description as string).slice(0, 80)}" → ${input.outcome}${input.what_worked ? `\n  Sweet: ${(input.what_worked as string).slice(0, 100)}` : ""}${input.what_failed ? `\n  Sour: ${(input.what_failed as string).slice(0, 100)}` : ""}${input.strategy_change ? `\n  Zmiana: ${(input.strategy_change as string).slice(0, 100)}` : ""}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const evolutionTools: V3ToolDefinition[] = [
  getCapabilitiesTool,
  reflexionEvaluateTool,
];
