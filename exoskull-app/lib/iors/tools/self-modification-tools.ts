/**
 * Self-Modification IORS Tools
 *
 * Wraps the source-engine's modifySource() as an IORS tool so the agent
 * can autonomously propose code changes through the full safety pipeline:
 * kernel guard → diff generation → sandboxed testing → GitHub PR → risk routing.
 *
 * Rate limited: max 5 modifications per day per tenant (enforced by source-engine).
 */

import type { ToolDefinition } from "./shared";
import { logger } from "@/lib/logger";

export const selfModificationTools: ToolDefinition[] = [
  {
    definition: {
      name: "self_modify",
      description:
        "Zaproponuj modyfikację kodu źródłowego ExoSkull. " +
        "System wygeneruje diff, przetestuje w sandbox, i stworzy PR na GitHub. " +
        "Chronione pliki (kernel) są zablokowane automatycznie. " +
        "Limit: 5 modyfikacji dziennie. Użyj do: napraw błędów, nowych features, optymalizacji.",
      input_schema: {
        type: "object" as const,
        properties: {
          description: {
            type: "string",
            description:
              "Co chcesz zmienić i dlaczego. Im bardziej szczegółowo, tym lepszy diff.",
          },
          target_files: {
            type: "array",
            items: { type: "string" },
            description:
              "Ścieżki plików do modyfikacji (relative to repo root). " +
              'Np: ["lib/iors/tools/email-tools.ts", "lib/emotion/index.ts"]',
          },
          reason: {
            type: "string",
            description:
              "Powód modyfikacji — do audytu (np. goal_id, user request, self-optimization)",
          },
        },
        required: ["description", "target_files", "reason"],
      },
    },
    timeoutMs: 120_000, // 2min — source engine includes VPS testing
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const description = input.description as string;
      const targetFiles = input.target_files as string[];
      const reason = input.reason as string;

      if (!description || description.length < 10) {
        return "Error: opis modyfikacji musi mieć min. 10 znaków.";
      }

      if (!targetFiles || targetFiles.length === 0) {
        return "Error: podaj przynajmniej jeden plik do modyfikacji.";
      }

      if (targetFiles.length > 10) {
        return "Error: max 10 plików na jedną modyfikację.";
      }

      try {
        const { modifySource } =
          await import("@/lib/self-modification/source-engine");

        const result = await modifySource(tenantId, {
          description,
          targetFiles,
          context: reason,
          triggeredBy: "user_request",
        });

        if (!result.success) {
          if (result.blockedReason) {
            return `Modyfikacja zablokowana: ${result.blockedReason}`;
          }
          return `Modyfikacja nie powiodła się: ${result.error || "nieznany błąd"}`;
        }

        return (
          `Modyfikacja zakończona.\n` +
          `PR: ${result.prUrl || "brak URL"}\n` +
          `Ryzyko: ${result.riskLevel}\n` +
          `Testy: ${result.testsPassed ? "PASS" : "FAIL (PR wymaga review)"}\n` +
          `PR #${result.prNumber || "?"}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[SelfModification] Tool execution failed:", {
          tenantId,
          error: msg,
        });
        return `Error: ${msg}`;
      }
    },
  },

  {
    definition: {
      name: "view_modifications",
      description:
        "Pokaż historię modyfikacji kodu — co agent zmieniał, PR status, testy.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "integer",
            description: "Ile wpisów (domyślnie 5, max 15)",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      try {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const limit = Math.min(Number(input.limit) || 5, 15);

        const { data, error } = await supabase
          .from("exo_source_modifications")
          .select(
            "id, description, status, risk_level, pr_url, pr_number, test_passed, created_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) return `Error: ${error.message}`;
        if (!data || data.length === 0)
          return "Brak historii modyfikacji kodu.";

        return data
          .map(
            (m) =>
              `- [${m.status}] ${m.description?.slice(0, 80)} ` +
              `(risk: ${m.risk_level}, tests: ${m.test_passed ? "PASS" : "FAIL"}) ` +
              `${m.pr_url ? m.pr_url : ""}`,
          )
          .join("\n");
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },
];
