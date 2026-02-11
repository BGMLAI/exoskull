/**
 * Knowledge Engine — AI Synthesizer
 *
 * Takes a TenantKnowledgeSnapshot and uses AI (Tier 2 Haiku)
 * to discover non-obvious patterns and propose actions.
 *
 * Cost: ~$0.01-0.05 per deep analysis.
 */

import { getModelRouter } from "@/lib/ai/model-router";
import { logger } from "@/lib/logger";
import type {
  TenantKnowledgeSnapshot,
  KnowledgeInsight,
  InsightType,
  ActionType,
} from "./types";

const SYSTEM_PROMPT = `Jesteś analitykiem danych osobistych systemu ExoSkull.
Analizujesz holistycznie wszystkie dane użytkownika i odkrywasz wzorce, których reguły nie wyłapią.

ZASADY:
1. Szukaj NIEOCZYWISTYCH korelacji (nie "śpisz mało = jesteś zmęczony")
2. Porównuj z poprzednimi okresami — co się ZMIENIŁO?
3. Wykrywaj LUKI — czego brakuje w danych?
4. Proponuj KONKRETNE działania (nie ogólniki)
5. Max 5 insights na analizę (jakość > ilość)
6. NIE powtarzaj insightów z poprzednich analiz
7. Pisz po polsku, zwięźle

TYPY INSIGHTÓW:
- pattern: wykryty powtarzalny wzorzec
- gap: brak danych w ważnym obszarze
- drift: negatywna zmiana trendu
- correlation: nieoczywisty związek między domenami
- opportunity: szansa do wykorzystania
- warning: ostrzeżenie o ryzyku
- celebration: pochwała za postęp

TYPY DZIAŁAŃ:
- propose_intervention: stwórz interwencję (wiadomość/zadanie/alert)
- adjust_behavior: zmień parametry IORS (proactivity, style)
- suggest_tracking: zaproponuj nowy tracker/skill
- probe_gap: zapytaj o brakujący domain
- celebrate: pochwał postęp
- warn_drift: ostrzeż o negatywnym trendzie
- connect_dots: pokaż nieoczywisty związek

ODPOWIEDZ WYŁĄCZNIE POPRAWNYM JSON-em: tablicą obiektów insight.
Nie dodawaj żadnego tekstu poza JSON-em.`;

/**
 * Build a compressed snapshot summary for the AI prompt.
 * Keeps tokens low (~1000-1500) while preserving all key signals.
 */
function compressSnapshot(snapshot: TenantKnowledgeSnapshot): string {
  const s = snapshot;
  const parts: string[] = [];

  // Conversations
  parts.push(
    `ROZMOWY (30d): ${s.conversations.totalMessages} msg, avg ${s.conversations.avgPerDay.toFixed(1)}/dzień, user_pct=${(s.conversations.userMessagesPct * 100).toFixed(0)}%`,
  );
  if (s.conversations.topTopics.length > 0) {
    parts.push(`Tematy: ${s.conversations.topTopics.join(", ")}`);
  }
  const channels = Object.entries(s.conversations.channelBreakdown);
  if (channels.length > 0) {
    parts.push(`Kanały: ${channels.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  parts.push(
    `Emocje: trend=${s.conversations.emotionTrend}, valence=${s.conversations.avgValence.toFixed(2)}`,
  );

  // Health (from Gold layer)
  parts.push(`\nZDROWIE (Gold):`);
  parts.push(
    `Sen: trend=${s.health.sleepTrend}, avg_jakość=${s.health.avgSleepQuality?.toFixed(1) ?? "brak"}, avg_min=${s.health.avgSleepMinutes?.toFixed(0) ?? "brak"}, avg_HRV=${s.health.avgHRV?.toFixed(0) ?? "brak"}, avg_HR=${s.health.avgHeartRate?.toFixed(0) ?? "brak"}`,
  );
  parts.push(
    `Aktywność: trend=${s.health.activityTrend}, avg_kroki=${s.health.avgSteps?.toFixed(0) ?? "brak"}, avg_aktywne_min=${s.health.avgActiveMinutes?.toFixed(0) ?? "brak"}`,
  );
  if (s.health.activePredictions.length > 0) {
    parts.push(
      `Predykcje: ${s.health.activePredictions.map((p) => `${p.metric}=${p.probability.toFixed(2)}(${p.severity})`).join(", ")}`,
    );
  }

  // Productivity
  parts.push(`\nPRODUKTYWNOŚĆ:`);
  parts.push(
    `Zadania: completion=${(s.productivity.completionRate * 100).toFixed(0)}%, overdue=${s.productivity.overdueCount}, stalled=${s.productivity.stalledCount}, pending=${s.productivity.totalPending}`,
  );
  if (s.productivity.goalStatuses.length > 0) {
    parts.push(
      `Cele: ${s.productivity.goalStatuses.map((g) => `${g.name}(${g.trajectory},${g.progress}%)`).join(", ")}`,
    );
  }

  // Knowledge
  parts.push(`\nWIEDZA SYSTEMOWA:`);
  if (s.knowledge.mits.length > 0) {
    parts.push(
      `MITs: ${s.knowledge.mits.map((m) => `#${m.rank} ${m.objective}`).join(", ")}`,
    );
  }
  if (s.knowledge.activePatterns.length > 0) {
    parts.push(
      `Wzorce: ${s.knowledge.activePatterns.map((p) => `${p.type}:${p.description}(${(p.confidence * 100).toFixed(0)}%)`).join("; ")}`,
    );
  }
  if (s.knowledge.topHighlights.length > 0) {
    parts.push(
      `Top highlights: ${s.knowledge.topHighlights
        .slice(0, 5)
        .map((h) => `[${h.category}] ${h.content.slice(0, 60)}`)
        .join("; ")}`,
    );
  }

  // System performance
  parts.push(`\nSYSTEM IORS:`);
  parts.push(
    `Interwencje: success=${(s.systemPerformance.interventionSuccessRate * 100).toFixed(0)}%, ack=${(s.systemPerformance.coachingAckRate * 100).toFixed(0)}%`,
  );
  parts.push(
    `Feedback: avg=${s.systemPerformance.avgFeedbackRating?.toFixed(1) ?? "brak"}`,
  );
  parts.push(
    `Styl: ${s.systemPerformance.personalityStyle}, proaktywność=${s.systemPerformance.proactivityLevel}`,
  );

  // Gaps
  if (s.missingDomains.length > 0) {
    parts.push(`\nBRAKI DANYCH: ${s.missingDomains.join(", ")}`);
  }

  // Deltas (computed from Gold daily data)
  const d = s.priorPeriodDelta;
  const deltas: string[] = [];
  if (d.sleepQualityChange !== 0)
    deltas.push(
      `sen: ${d.sleepQualityChange > 0 ? "+" : ""}${d.sleepQualityChange.toFixed(0)}%`,
    );
  if (d.engagementChange !== 0)
    deltas.push(
      `zaangażowanie: ${d.engagementChange > 0 ? "+" : ""}${d.engagementChange.toFixed(0)}%`,
    );
  if (d.moodChange !== 0)
    deltas.push(
      `nastrój: ${d.moodChange > 0 ? "+" : ""}${d.moodChange.toFixed(0)}%`,
    );
  if (deltas.length > 0) {
    parts.push(`\nZMIANY VS POPRZEDNI OKRES: ${deltas.join(", ")}`);
  }

  // Data source indicator
  parts.push(`\nŹRÓDŁO DANYCH: ${s.dataSource}`);

  return parts.join("\n");
}

/**
 * Validate and parse AI response into typed insights.
 */
function parseInsights(raw: string): KnowledgeInsight[] {
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    const validTypes: InsightType[] = [
      "pattern",
      "gap",
      "drift",
      "correlation",
      "opportunity",
      "warning",
      "celebration",
    ];
    const validActions: ActionType[] = [
      "propose_intervention",
      "adjust_behavior",
      "suggest_tracking",
      "probe_gap",
      "celebrate",
      "warn_drift",
      "connect_dots",
    ];

    return parsed
      .filter(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          "title" in item &&
          "action" in item,
      )
      .map((item: Record<string, unknown>) => ({
        type: validTypes.includes(item.type as InsightType)
          ? (item.type as InsightType)
          : "pattern",
        title: String(item.title ?? ""),
        description: String(item.description ?? ""),
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
        domains: Array.isArray(item.domains) ? item.domains.map(String) : [],
        evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
        action: {
          type: validActions.includes(
            (item.action as Record<string, unknown>)?.type as ActionType,
          )
            ? ((item.action as Record<string, unknown>).type as ActionType)
            : "connect_dots",
          payload:
            typeof (item.action as Record<string, unknown>)?.payload ===
            "object"
              ? ((item.action as Record<string, unknown>).payload as Record<
                  string,
                  unknown
                >)
              : {},
          priority: ["low", "medium", "high"].includes(
            (item.action as Record<string, unknown>)?.priority as string,
          )
            ? ((item.action as Record<string, unknown>).priority as
                | "low"
                | "medium"
                | "high")
            : "medium",
          requires_user_approval:
            (item.action as Record<string, unknown>)?.requires_user_approval ===
            true,
        },
        expiry_hours: Number(item.expiry_hours) || 48,
      }))
      .slice(0, 5); // Max 5 insights
  } catch (error) {
    logger.warn("[KAE:Synthesizer] Failed to parse AI response:", {
      error: (error as Error).message,
      rawLength: raw.length,
    });
    return [];
  }
}

/**
 * Run AI synthesis on a knowledge snapshot.
 * Returns structured insights with action proposals.
 */
export async function synthesizeKnowledge(
  snapshot: TenantKnowledgeSnapshot,
  previousInsightTitles: string[] = [],
): Promise<{
  insights: KnowledgeInsight[];
  modelUsed: string;
  costCents: number;
}> {
  const router = getModelRouter();
  const compressed = compressSnapshot(snapshot);

  let userPrompt = compressed;
  if (previousInsightTitles.length > 0) {
    userPrompt += `\n\nPOPRZEDNIE INSIGHTS (nie powtarzaj): ${previousInsightTitles.join("; ")}`;
  }

  try {
    const response = await router.route({
      tenantId: snapshot.tenantId,
      taskCategory: "analysis",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    });

    const insights = parseInsights(response.content);
    const costCents = (response.usage?.estimatedCost ?? 0) * 100;

    logger.info("[KAE:Synthesizer] Analysis complete:", {
      tenantId: snapshot.tenantId,
      insightsGenerated: insights.length,
      model: response.model,
      costCents,
    });

    return {
      insights,
      modelUsed: response.model ?? "unknown",
      costCents,
    };
  } catch (error) {
    logger.error("[KAE:Synthesizer] AI call failed:", {
      tenantId: snapshot.tenantId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { insights: [], modelUsed: "error", costCents: 0 };
  }
}

/**
 * Light analysis — rule-based, zero AI cost.
 * Detects anomalies from snapshot without calling an AI model.
 */
export function lightAnalysis(
  snapshot: TenantKnowledgeSnapshot,
): KnowledgeInsight[] {
  const insights: KnowledgeInsight[] = [];
  const s = snapshot;

  // Rule 1: Sleep declining + activity increasing = possible overtraining
  if (
    s.health.sleepTrend === "declining" &&
    s.health.activityTrend === "improving"
  ) {
    insights.push({
      type: "correlation",
      title: "Więcej ruchu, ale gorzej śpisz",
      description:
        "Aktywność rośnie, ale jakość snu spada. Możliwy overtreining lub trening za późno.",
      confidence: 0.65,
      domains: ["health", "sleep"],
      evidence: [
        `sleep_trend=${s.health.sleepTrend}`,
        `activity_trend=${s.health.activityTrend}`,
      ],
      action: {
        type: "probe_gap",
        payload: { question: "O której godzinie zwykle trenujesz?" },
        priority: "medium",
        requires_user_approval: false,
      },
      expiry_hours: 72,
    });
  }

  // Rule 2: High overdue tasks + declining mood
  if (
    s.productivity.overdueCount >= 3 &&
    s.conversations.emotionTrend === "declining"
  ) {
    insights.push({
      type: "warning",
      title: "Zaległe zadania wpływają na nastrój",
      description: `Masz ${s.productivity.overdueCount} zaległych zadań, a nastrój spada. Może warto wybrać jedno najważniejsze i zacząć od niego?`,
      confidence: 0.7,
      domains: ["productivity", "emotion"],
      evidence: [
        `overdue=${s.productivity.overdueCount}`,
        `emotion_trend=${s.conversations.emotionTrend}`,
      ],
      action: {
        type: "propose_intervention",
        payload: {
          type: "task_reminder",
          message: "Masz zaległe zadania. Chcesz wybrać jedno do zrobienia?",
        },
        priority: "medium",
        requires_user_approval: false,
      },
      expiry_hours: 24,
    });
  }

  // Rule 3: HRV critically low
  if (s.health.avgHRV != null && s.health.avgHRV < 30) {
    insights.push({
      type: "warning",
      title: "Krytycznie niskie HRV",
      description: `Średnie HRV = ${s.health.avgHRV.toFixed(0)}ms. To może oznaczać duży stres lub przeciążenie.`,
      confidence: 0.8,
      domains: ["health"],
      evidence: [`avg_hrv=${s.health.avgHRV.toFixed(0)}`],
      action: {
        type: "warn_drift",
        payload: {
          message:
            "Twoje HRV jest bardzo niskie. Czy czujesz się dobrze? Rozważ dzień odpoczynku.",
        },
        priority: "high",
        requires_user_approval: true,
      },
      expiry_hours: 24,
    });
  }

  // Rule 4: Missing domains (gap detection)
  const criticalMissing = s.missingDomains.filter(
    (d) => !["finance", "social"].includes(d),
  );
  if (criticalMissing.length > 0) {
    insights.push({
      type: "gap",
      title: `Brak danych: ${criticalMissing.join(", ")}`,
      description: `Nie mam danych z obszarów: ${criticalMissing.join(", ")}. To utrudnia analizę.`,
      confidence: 0.9,
      domains: criticalMissing,
      evidence: criticalMissing.map((d) => `${d}=no_data`),
      action: {
        type: "suggest_tracking",
        payload: { domains: criticalMissing },
        priority: "low",
        requires_user_approval: false,
      },
      expiry_hours: 168, // 7 days
    });
  }

  // Rule 5: All goals off-track
  const offTrackGoals = s.productivity.goalStatuses.filter(
    (g) => g.trajectory === "off_track",
  );
  if (
    offTrackGoals.length > 0 &&
    offTrackGoals.length === s.productivity.goalStatuses.length
  ) {
    insights.push({
      type: "drift",
      title: "Wszystkie cele off-track",
      description: `Żaden z ${offTrackGoals.length} celów nie jest na dobrej drodze. Może trzeba je zrewidować?`,
      confidence: 0.85,
      domains: ["productivity", "goals"],
      evidence: offTrackGoals.map((g) => `${g.name}=${g.trajectory}`),
      action: {
        type: "propose_intervention",
        payload: {
          type: "goal_nudge",
          message: "Twoje cele wymagają uwagi. Chcesz je przejrzeć?",
        },
        priority: "high",
        requires_user_approval: false,
      },
      expiry_hours: 48,
    });
  }

  // Rule 6: Good sleep + good mood = celebrate
  if (
    s.health.sleepTrend === "improving" &&
    s.conversations.emotionTrend === "improving"
  ) {
    insights.push({
      type: "celebration",
      title: "Świetny trend — sen i nastrój rosną",
      description:
        "Zarówno jakość snu jak i nastrój poprawiają się. Cokolwiek robisz — kontynuuj!",
      confidence: 0.75,
      domains: ["health", "emotion"],
      evidence: [`sleep_trend=improving`, `emotion_trend=improving`],
      action: {
        type: "celebrate",
        payload: {
          message: "Twój sen i nastrój się poprawiają — tak trzymaj!",
        },
        priority: "low",
        requires_user_approval: false,
      },
      expiry_hours: 72,
    });
  }

  return insights.slice(0, 5);
}
