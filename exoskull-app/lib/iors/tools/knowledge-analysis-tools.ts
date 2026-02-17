/**
 * IORS Tool: Knowledge Analysis
 *
 * Allows IORS to run on-demand knowledge analysis when user asks
 * "what patterns do you see?" or "analyze my data".
 */

import type { ToolDefinition } from "./shared";

export const knowledgeAnalysisTools: ToolDefinition[] = [
  {
    definition: {
      name: "analyze_knowledge",
      description:
        "Przeanalizuj holistycznie wszystkie dane użytkownika (sen, zdrowie, zadania, emocje, cele, wzorce) i odkryj nieoczywiste wzorce, korelacje, luki i propozycje działań. Użyj gdy użytkownik pyta o analizę swoich danych, wzorce, trendy, lub gdy chcesz proaktywnie zaproponować działania na podstawie głębokiej analizy.",
      input_schema: {
        type: "object" as const,
        properties: {
          analysis_type: {
            type: "string",
            enum: ["deep", "light"],
            description:
              "deep = pełna analiza AI (~$0.02), light = szybka analiza reguł ($0). Domyślnie deep.",
          },
          focus_area: {
            type: "string",
            description:
              "Opcjonalny obszar do szczególnej analizy, np. 'sleep', 'productivity', 'emotions'.",
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
        const { runKnowledgeAnalysis } =
          await import("@/lib/iors/knowledge-engine");

        const analysisType =
          (input.analysis_type as "deep" | "light") ?? "deep";

        const result = await runKnowledgeAnalysis(
          tenantId,
          analysisType,
          "manual",
        );

        if (result.insights.length === 0) {
          return "Analiza zakończona. Brak nowych insightów — dane nie zmieniły się od ostatniej analizy lub brak wystarczających danych.";
        }

        // Format insights for conversation
        const lines: string[] = [
          `Analiza ${analysisType} zakończona (${result.durationMs}ms):`,
          "",
        ];

        for (const insight of result.insights) {
          const icon =
            insight.type === "warning"
              ? "⚠️"
              : insight.type === "celebration"
                ? "🎉"
                : insight.type === "gap"
                  ? "🔍"
                  : insight.type === "correlation"
                    ? "🔗"
                    : insight.type === "drift"
                      ? "📉"
                      : "💡";

          lines.push(`${icon} **${insight.title}**`);
          lines.push(`   ${insight.description}`);
          lines.push(
            `   Pewność: ${(insight.confidence * 100).toFixed(0)}% | Domeny: ${insight.domains.join(", ")}`,
          );
          lines.push("");
        }

        // Summary of actions taken
        const executed = result.actions.filter(
          (a) => a.status === "executed",
        ).length;
        const proposed = result.actions.filter(
          (a) => a.status === "proposed",
        ).length;

        if (executed > 0 || proposed > 0) {
          lines.push(
            `Działania: ${executed} wykonanych, ${proposed} do zatwierdzenia.`,
          );
        }

        return lines.join("\n");
      } catch (error) {
        console.error("[analyze_knowledge] Failed:", {
          tenantId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
        return `Błąd analizy: ${(error as Error).message}`;
      }
    },
  },
];
