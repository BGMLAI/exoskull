/**
 * Agent Debate IORS Tools
 *
 * Allows IORS to trigger multi-agent debates for complex decisions.
 * 4 agents (Optymista, Krytyk, Szaleniec, Pragmatyk) debate in parallel
 * using Opus (Tier 4) for maximum reasoning quality.
 */

import { ToolDefinition } from "./shared";
import { runDebate, DebateResult } from "@/lib/ai/agent-debate";

// ============================================================================
// TOOL DEFINITIONS (ToolDefinition format for registry)
// ============================================================================

export const debateTools: ToolDefinition[] = [
  {
    definition: {
      name: "start_debate",
      description:
        "Uruchom debate wieloagentowa na dany temat. 4 agentow (Optymista, Krytyk, Szaleniec, Pragmatyk) " +
        "analizuja pytanie z roznych perspektyw. Uzywaj dla waznych decyzji zyciowych, strategicznych " +
        "wyborow, dylematow. Szaleniec uzywa technik lateralnego myslenia (De Bono, random association). " +
        "Kazdy agent dziala na Opus (Tier 4) dla maksymalnej jakosci rozumowania. " +
        "Debata kosztuje ~$0.30-0.60 (4 agentow x 2 rundy x Opus).",
      input_schema: {
        type: "object" as const,
        properties: {
          question: {
            type: "string",
            description:
              "Pytanie lub dylemat do debaty. Powinno byc otwarte, nie tak/nie. " +
              "Np. 'Czy powinienem zmienic prace?', 'Jak najlepiej zainwestowac oszczednosci?', " +
              "'Jaki kierunek rozwoju wybrac?'",
          },
          context: {
            type: "string",
            description:
              "Dodatkowy kontekst: sytuacja uzytkownika, ograniczenia, wczesniejsze doswiadczenia. " +
              "Im wiecej kontekstu, tym lepsza debata.",
          },
          rounds: {
            type: "number",
            description:
              "Liczba rund debaty (1-3). Domyslnie 2. Wiecej rund = glebsza analiza ale wyzszy koszt.",
          },
        },
        required: ["question"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const question = input.question as string;
      const context = input.context as string | undefined;
      const rounds = input.rounds as number | undefined;

      if (!question || question.length < 10) {
        return "Pytanie jest za krotkie. Podaj pytanie otwarte z co najmniej 10 znakami.";
      }

      try {
        console.info("[DebateTool] Starting debate:", {
          tenantId,
          question: question.slice(0, 80),
          rounds: rounds ?? 2,
        });

        const result = await runDebate({
          question,
          context,
          maxRounds: Math.min(rounds ?? 2, 3),
          tenantId,
        });

        return formatDebateResult(result);
      } catch (error) {
        console.error("[DebateTool] Debate failed:", {
          error: error instanceof Error ? error.message : "Unknown",
          tenantId,
        });
        return `Debata nie powiodla sie: ${error instanceof Error ? error.message : "Nieznany blad"}`;
      }
    },
    timeoutMs: 120_000, // 2 min — debates take time (4 agents x 2 rounds)
  },
];

// ============================================================================
// FORMATTING
// ============================================================================

function formatDebateResult(result: DebateResult): string {
  const sections: string[] = [];

  sections.push(`# Debata wieloagentowa\n**Pytanie:** ${result.question}\n`);

  // Summarize each round
  for (const round of result.rounds) {
    sections.push(
      `## Runda ${round.roundNumber} — ${round.phase.toUpperCase()}`,
    );
    for (const c of round.contributions) {
      const roleLabel =
        c.role === "optimist"
          ? "[Optymista]"
          : c.role === "critic"
            ? "[Krytyk]"
            : c.role === "creative"
              ? "[Szaleniec]"
              : "[Pragmatyk]";
      sections.push(`### ${roleLabel} ${c.agentName}\n${c.content}\n`);
    }
  }

  // Consensus
  sections.push(`## Synteza i konsensus\n${result.consensus}`);

  // Stats
  sections.push(
    `\n---\n*${result.agentCount} agentow, ${result.rounds.length} rund, ` +
      `${(result.totalDurationMs / 1000).toFixed(1)}s, ` +
      `~$${result.totalCost.toFixed(4)}*`,
  );

  return sections.join("\n\n");
}
