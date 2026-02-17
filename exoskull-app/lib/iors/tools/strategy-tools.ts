/**
 * IORS Strategy Tools
 *
 * Industry tracking, scenario analysis, strategic recommendations.
 * Uses Opus for highest quality strategic thinking.
 */

import type { ToolDefinition } from "./shared";
import {
  analyzeIndustry,
  analyzeScenarios,
  formatReport,
} from "@/lib/ai/industry-tracker";

export const strategyTools: ToolDefinition[] = [
  {
    definition: {
      name: "analyze_industry",
      description:
        "Analizuj branze: trendy, okazje, zagrozenia, rekomendowane ruchy. Uzywa Opus dla najwyzszej jakosci strategicznej. Uzywaj gdy user pyta o branze, rynek, konkurencje, strategie.",
      input_schema: {
        type: "object" as const,
        properties: {
          industry: {
            type: "string",
            description:
              "Branza do analizy (np. 'AI/technology', 'e-commerce', 'healthcare')",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      try {
        const report = await analyzeIndustry(
          tenantId,
          input.industry as string,
        );
        return formatReport(report);
      } catch (err) {
        return `Blad analizy branzy: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 120000,
  },
  {
    definition: {
      name: "analyze_scenarios",
      description:
        "Analiza scenariuszy 'co jesli' — rozne sciezki do celu z prawdopodobienstwem sukcesu. Zasada Pareto: min wysilek → max efekt. Uzywaj gdy user pyta 'jak to osiagnac?', 'jakie mam opcje?'.",
      input_schema: {
        type: "object" as const,
        properties: {
          goal: {
            type: "string",
            description: "Cel do osiagniecia",
          },
          constraints: {
            type: "string",
            description: "Ograniczenia (budzet, czas, zasoby)",
          },
        },
        required: ["goal"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await analyzeScenarios(
          tenantId,
          input.goal as string,
          input.constraints as string,
        );

        if (!result.scenarios.length) return result.recommendation;

        const lines = [`Analiza scenariuszy dla: "${input.goal}"`, ""];

        for (const [i, s] of result.scenarios.entries()) {
          lines.push(
            `${i + 1}. ${s.name} (${Math.round(s.probability * 100)}% szans)`,
          );
          lines.push(`   ${s.description}`);
          lines.push(
            `   Wysilek: ${s.effort} | Oczekiwany wynik: ${s.expectedOutcome}`,
          );
          if (s.steps.length) {
            lines.push(
              `   Kroki: ${s.steps.slice(0, 3).join(" → ")}${s.steps.length > 3 ? " → ..." : ""}`,
            );
          }
          if (s.risks.length) {
            lines.push(`   Ryzyka: ${s.risks.slice(0, 2).join(", ")}`);
          }
          lines.push("");
        }

        lines.push(`REKOMENDACJA: ${result.recommendation}`);
        return lines.join("\n");
      } catch (err) {
        return `Blad analizy scenariuszy: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 120000,
  },
];
