/**
 * Agent Debate Engine
 *
 * Spawns N agents with different perspectives to analyze a question.
 * Uses structured rounds: propose → critique → refine → consensus.
 *
 * One agent is intentionally "crazy" — uses lateral thinking techniques:
 * - Random word association
 * - Reverse problem statement
 * - Analogies from unrelated domains
 * - De Bono's "Black Hat" thinking
 *
 * All agents run on Opus (Tier 4) for maximum reasoning quality.
 */

import { aiChat, AIMessage, AIResponse } from "@/lib/ai";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

export interface DebateAgent {
  id: string;
  name: string;
  role: DebateRole;
  systemPrompt: string;
}

export type DebateRole = "optimist" | "critic" | "creative" | "pragmatist";

export interface DebateRound {
  roundNumber: number;
  phase: "propose" | "critique" | "refine" | "consensus";
  contributions: DebateContribution[];
}

export interface DebateContribution {
  agentId: string;
  agentName: string;
  role: DebateRole;
  content: string;
  model: string;
  latencyMs: number;
}

export interface DebateResult {
  question: string;
  rounds: DebateRound[];
  consensus: string;
  dissent: string[];
  totalDurationMs: number;
  totalCost: number;
  agentCount: number;
}

export interface DebateOptions {
  question: string;
  context?: string;
  maxRounds?: number; // default 3
  tenantId?: string;
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

const LATERAL_TECHNIQUES = [
  "Random Word Association: Pick a random word and force a connection to the problem",
  "Reverse Problem: What if we wanted the OPPOSITE outcome? What would we do?",
  "Cross-Domain Analogy: How would a chef/architect/musician/biologist solve this?",
  "De Bono's Po: Start from a deliberately illogical premise and see where it leads",
  "Worst Possible Idea: What's the absolute worst solution? Now invert it.",
  "Time Travel: How would someone from 1900/2100 approach this problem?",
  "Scale Shift: What if this problem was 1000x bigger or 1000x smaller?",
  "Constraint Removal: What if money/time/physics were not constraints?",
];

function buildAgents(question: string, context?: string): DebateAgent[] {
  const randomTechnique =
    LATERAL_TECHNIQUES[Math.floor(Math.random() * LATERAL_TECHNIQUES.length)];

  return [
    {
      id: "optimist",
      name: "Optymista",
      role: "optimist",
      systemPrompt: `Jestes agentem-optymista w debacie wieloagentowej.

Twoja rola:
- Szukaj NAJLEPSZYCH mozliwosci w kazdej sytuacji
- Identyfikuj ukryte szanse i potencjal
- Proponuj ambitne ale realistyczne rozwiazania
- Buduj na pomyslach innych agentow
- Wskazuj co MOZE sie udac i dlaczego

Styl: Entuzjastyczny ale merytoryczny. Nie naiwny — realistyczny optymizm.
Jezyk: Polski.

Kontekst: ${context || "brak dodatkowego kontekstu"}`,
    },
    {
      id: "critic",
      name: "Krytyk",
      role: "critic",
      systemPrompt: `Jestes agentem-krytykiem w debacie wieloagentowej.

Twoja rola:
- Identyfikuj RYZYKA i slabe punkty w kazdym pomysle
- Pytaj "co moze pojsc nie tak?" i "jakie sa ukryte koszty?"
- Znajdz luki logiczne, false assumptions, nieuwzglednione scenariusze
- De Bono's Black Hat: deliberately look for dangers and weaknesses
- NIE odrzucaj pomyslow — wskazuj jak je ULEPSZIC poprzez eliminacje ryzyk

Styl: Ostry ale konstruktywny. Krytyka + sugestia ulepszenia.
Jezyk: Polski.

Kontekst: ${context || "brak dodatkowego kontekstu"}`,
    },
    {
      id: "creative",
      name: "Szaleniec",
      role: "creative",
      systemPrompt: `Jestes SZALONCEM — agentem kreatywnym w debacie wieloagentowej.

Twoja rola jest KRYTYCZNA: musisz myslec INACZEJ niz wszyscy.

Techniki lateralnego myslenia (uzyj JEDNEJ losowo):
${LATERAL_TECHNIQUES.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Dzisiaj uzyj: ${randomTechnique}

Zasady:
- NIGDY nie idz utartym szlakiem
- Proponuj rozwiazania z INNYCH dziedzin (biologia, architektura, muzyka, sport, sztuka)
- Pytaj "a co jesli?" i "dlaczego NIE?"
- Mozesz byc absurdalny — z absurdu czesto rodza sie genialne pomysly
- Szukaj analogii tam gdzie nikt nie szuka
- Edward de Bono "Po" — zacznij od celow logicznego punktu i rozwin

Styl: Nieprzewidywalny, prowokujacy, inspirujacy. Moze uzywac metafor i analogii.
Jezyk: Polski.

Kontekst: ${context || "brak dodatkowego kontekstu"}`,
    },
    {
      id: "pragmatist",
      name: "Pragmatyk",
      role: "pragmatist",
      systemPrompt: `Jestes agentem-pragmatykiem w debacie wieloagentowej.

Twoja rola:
- Oceniaj WYKONALNOSC kazdego pomyslu
- Pytaj: "Ile to kosztuje?", "Ile czasu zajmie?", "Kto to zrobi?"
- Proponuj MVP — minimalne wdrozenie dajace wartosc
- Identyfikuj Quick Wins vs Long-term Investments
- Ustalaj PRIORYTETY — co NAJPIERW, co POTEM
- Planuj etapami: faza 1 → faza 2 → faza 3

Styl: Konkretny, zorientowany na dzialanie, praktyczny.
Jezyk: Polski.

Kontekst: ${context || "brak dodatkowego kontekstu"}`,
    },
  ];
}

// ============================================================================
// DEBATE ENGINE
// ============================================================================

/**
 * Run a multi-agent debate on a question.
 *
 * Flow per round:
 * 1. PROPOSE: All agents independently answer the question
 * 2. CRITIQUE: Each agent critiques ALL other proposals
 * 3. REFINE: Each agent refines their proposal based on critiques
 * 4. CONSENSUS: All agents vote on best approach, synthesize final answer
 */
export async function runDebate(options: DebateOptions): Promise<DebateResult> {
  const startTime = Date.now();
  const maxRounds = options.maxRounds ?? 2;
  const agents = buildAgents(options.question, options.context);
  const rounds: DebateRound[] = [];
  let totalCost = 0;

  logger.info("[AgentDebate] Starting debate:", {
    question: options.question.slice(0, 100),
    agents: agents.map((a) => a.name),
    maxRounds,
  });

  for (let round = 1; round <= maxRounds; round++) {
    // ── PHASE 1: PROPOSE ──────────────────────────────────────────────
    const proposePrompt =
      round === 1
        ? `Pytanie do debaty:\n\n${options.question}\n\nPrzedstaw swoja perspektywe (max 300 slow). Badz konkretny.`
        : `Pytanie do debaty:\n\n${options.question}\n\nPoprzednia runda:\n${formatRoundSummary(rounds[rounds.length - 1])}\n\nUdoskonal swoja perspektywe na podstawie dyskusji (max 300 slow).`;

    const proposeContributions = await runPhaseParallel(
      agents,
      proposePrompt,
      options.tenantId,
    );
    totalCost += sumCost(proposeContributions);

    rounds.push({
      roundNumber: round,
      phase: "propose",
      contributions: proposeContributions,
    });

    // ── PHASE 2: CRITIQUE ──────────────────────────────────────────────
    const allProposals = proposeContributions
      .map((c) => `**${c.agentName} (${c.role}):**\n${c.content}`)
      .join("\n\n---\n\n");

    const critiquePrompt = `Oto propozycje wszystkich agentow:\n\n${allProposals}\n\nSkomentuj KAZDEGO agenta — co dobrego, co slabego, co brakuje. Badz zwiezly (max 200 slow).`;

    const critiqueContributions = await runPhaseParallel(
      agents,
      critiquePrompt,
      options.tenantId,
    );
    totalCost += sumCost(critiqueContributions);

    rounds.push({
      roundNumber: round,
      phase: "critique",
      contributions: critiqueContributions,
    });
  }

  // ── FINAL PHASE: CONSENSUS ──────────────────────────────────────────
  const fullDebateSummary = rounds
    .map(
      (r) =>
        `## Runda ${r.roundNumber} — ${r.phase}\n${r.contributions.map((c) => `**${c.agentName}:** ${c.content}`).join("\n\n")}`,
    )
    .join("\n\n---\n\n");

  const consensusPrompt = `Przebieg calej debaty:\n\n${fullDebateSummary}\n\nNa podstawie CALEJ dyskusji, napisz:\n1. KONSENSUS: Na czym sie wszyscy (lub wiekszosc) zgadzaja? (200 slow)\n2. DYSYDENCJA: Jakie punkty pozostaja sporne? (100 slow)\n3. REKOMENDACJA: Jaki jest najlepszy plan dzialania? (150 slow)\n\nBadz konkretny i wykonalny.`;

  const consensusResponse = await aiChat(
    [
      {
        role: "system",
        content:
          "Jestes moderatorem debaty. Syntezuj wnioski z wieloagentowej dyskusji. Jezyk: Polski.",
      },
      { role: "user", content: consensusPrompt },
    ],
    {
      taskCategory: "strategic",
      tenantId: options.tenantId,
    },
  );

  totalCost += consensusResponse.usage.estimatedCost;

  // Parse consensus vs dissent from response
  const consensusText = consensusResponse.content;
  const dissentMatch = consensusText.match(
    /DYSYDENCJA[:\s]*([\s\S]*?)(?=REKOMENDACJA|$)/i,
  );

  const result: DebateResult = {
    question: options.question,
    rounds,
    consensus: consensusText,
    dissent: dissentMatch
      ? dissentMatch[1]
          .trim()
          .split("\n")
          .filter((l) => l.trim())
      : [],
    totalDurationMs: Date.now() - startTime,
    totalCost,
    agentCount: agents.length,
  };

  logger.info("[AgentDebate] Debate complete:", {
    rounds: rounds.length,
    durationMs: result.totalDurationMs,
    cost: `$${totalCost.toFixed(4)}`,
  });

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Run all agents in parallel for a given prompt
 */
async function runPhaseParallel(
  agents: DebateAgent[],
  prompt: string,
  tenantId?: string,
): Promise<DebateContribution[]> {
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      const start = Date.now();
      const response = await aiChat(
        [
          { role: "system", content: agent.systemPrompt },
          { role: "user", content: prompt },
        ],
        {
          taskCategory: "strategic",
          tenantId,
          maxTokens: 2048,
        },
      );

      return {
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        content: response.content,
        model: response.model,
        latencyMs: Date.now() - start,
        cost: response.usage.estimatedCost,
      } satisfies DebateContribution & { cost: number };
    }),
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map(
      (r) =>
        (r as PromiseFulfilledResult<DebateContribution & { cost: number }>)
          .value,
    );
}

function sumCost(
  contributions: (DebateContribution & { cost?: number })[],
): number {
  return contributions.reduce((sum, c) => sum + ((c as any).cost || 0), 0);
}

function formatRoundSummary(round: DebateRound): string {
  return round.contributions
    .map((c) => `**${c.agentName} (${c.role}):** ${c.content.slice(0, 200)}...`)
    .join("\n\n");
}
