/**
 * Ralph Loop IORS Tools
 *
 * Tools for the user to interact with the internal development loop:
 * - view_dev_journal: see what system has built/fixed/learned
 * - trigger_ralph_cycle: force a development cycle
 * - set_development_priority: tell system what to focus on
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

export const ralphTools: ToolDefinition[] = [
  {
    definition: {
      name: "view_dev_journal",
      description:
        "Pokaż dziennik rozwoju systemu — co zostało zbudowane, naprawione, czego się nauczono. " +
        "Użyj do: 'co ostatnio zbudowałeś?', 'pokaż zmiany w systemie', 'co się nauczyłeś?'",
      input_schema: {
        type: "object" as const,
        properties: {
          entry_type: {
            type: "string",
            enum: ["build", "fix", "learning", "plan", "observation"],
            description: "Filtruj po typie wpisu. Puste = wszystkie typy.",
          },
          limit: {
            type: "integer",
            description: "Ile wpisów zwrócić (domyślnie 10, max 25)",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const limit = Math.min(Number(input.limit) || 10, 25);

      let query = supabase
        .from("exo_dev_journal")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (input.entry_type) {
        query = query.eq("entry_type", input.entry_type);
      }

      const { data, error } = await query;

      if (error) {
        return `Error: nie mogę odczytać dziennika rozwoju: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return "Dziennik rozwoju jest pusty — system jeszcze nic nie zbudował autonomicznie.";
      }

      const entries = data.map((e: Record<string, unknown>) => {
        const outcome = e.outcome ? ` [${e.outcome}]` : "";
        const entity = e.related_entity ? ` (${e.related_entity})` : "";
        const date = new Date(e.created_at as string).toLocaleString("pl", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `- [${e.entry_type}] ${e.title}${outcome}${entity} — ${date}`;
      });

      return `Dziennik rozwoju (ostatnie ${data.length}):\n${entries.join("\n")}`;
    },
  },
  {
    definition: {
      name: "trigger_ralph_cycle",
      description:
        "Wymuś cykl rozwoju systemu (Ralph Loop). System przeanalizuje braki, zaplanuje i zbuduje ulepszenia. " +
        "Użyj do: 'popraw się', 'rozwijaj się', 'znajdź co możesz ulepszyć'",
      input_schema: {
        type: "object" as const,
        properties: {
          focus: {
            type: "string",
            description:
              "Opcjonalny focus: na czym skupić cykl? np. 'napraw błędy', 'zbuduj nową apkę', 'popraw istniejące'",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();

      // Create a plan entry in dev journal to trigger Ralph Loop
      const { error } = await supabase.from("exo_dev_journal").insert({
        tenant_id: tenantId,
        entry_type: "plan",
        title: `Wymuszony cykl rozwoju: ${(input.focus as string) || "ogólny"}`,
        details: {
          trigger: "user_request",
          focus: input.focus || null,
          requested_at: new Date().toISOString(),
        },
        outcome: "pending",
      });

      if (error) {
        return `Error: nie mogę zaplanować cyklu rozwoju: ${error.message}`;
      }

      // Also emit a petla event so loop-15 picks it up
      await supabase.from("exo_petla_events").insert({
        tenant_id: tenantId,
        event_type: "system_development",
        event_data: {
          action: "ralph_cycle_requested",
          focus: input.focus || null,
        },
        priority: 3,
        status: "pending",
        expires_at: new Date(Date.now() + 360 * 60 * 1000).toISOString(),
      });

      return (
        "Zaplanowano cykl rozwoju. System przeanalizuje braki i zaproponuje ulepszenia " +
        "w ciągu najbliższych 15 minut (next loop-15 run)." +
        (input.focus ? ` Focus: ${input.focus}` : "")
      );
    },
  },
  {
    definition: {
      name: "set_development_priority",
      description:
        "Ustaw priorytet rozwoju — powiedz systemowi co jest najważniejsze do zbudowania/naprawienia. " +
        "Użyj do: 'priorytet: tracker nastroju', 'chcę żebyś skupił się na...', 'to jest ważne'",
      input_schema: {
        type: "object" as const,
        properties: {
          priority: {
            type: "string",
            description:
              "Co jest priorytetem (np. 'tracker nastroju', 'poprawa kalendarza')",
          },
          urgency: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Jak pilne (default: medium)",
          },
        },
        required: ["priority"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();

      const { error } = await supabase.from("exo_dev_journal").insert({
        tenant_id: tenantId,
        entry_type: "plan",
        title: `Priorytet użytkownika: ${input.priority}`,
        details: {
          priority: input.priority,
          urgency: input.urgency || "medium",
          source: "user_instruction",
          set_at: new Date().toISOString(),
        },
        outcome: "pending",
      });

      if (error) {
        return `Error: nie mogę zapisać priorytetu: ${error.message}`;
      }

      return (
        `Priorytet zapisany: "${input.priority}" (urgency: ${input.urgency || "medium"}). ` +
        "System uwzględni to w następnym cyklu rozwoju."
      );
    },
  },
  {
    definition: {
      name: "trigger_source_evolution",
      description:
        "Zleć modyfikację kodu źródłowego systemu — napraw buga, dodaj feature, zoptymalizuj. " +
        "System wygeneruje diff, przetestuje w sandboxie i stworzy PR na GitHubie. " +
        "Użyj do: 'napraw buga w X', 'dodaj feature Y do kodu', 'zoptymalizuj komponent Z'",
      input_schema: {
        type: "object" as const,
        properties: {
          description: {
            type: "string",
            description:
              "Co zmienić i dlaczego (np. 'napraw błąd parsowania daty w goal-progress', 'dodaj obsługę WhatsApp w outbound')",
          },
          target_files: {
            type: "array",
            items: { type: "string" },
            description:
              "Ścieżki plików do modyfikacji (opcjonalne, system sam wykryje jeśli puste)",
          },
        },
        required: ["description"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      try {
        const { modifySource } =
          await import("@/lib/self-modification/source-engine");
        const result = await modifySource(tenantId, {
          description: input.description as string,
          targetFiles: (input.target_files as string[]) || [],
          triggeredBy: "user_request",
        });

        if (result.success) {
          return (
            `Modyfikacja źródła: PR #${result.prNumber} utworzony.\n` +
            `URL: ${result.prUrl}\n` +
            `Poziom ryzyka: ${result.riskLevel}\n` +
            `Testy: ${result.testsPassed ? "PASS" : "nie uruchomione/FAIL"}`
          );
        }

        return `Modyfikacja zablokowana: ${result.blockedReason || result.error || "nieznany błąd"}`;
      } catch (error) {
        return `Błąd modyfikacji źródła: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
];
