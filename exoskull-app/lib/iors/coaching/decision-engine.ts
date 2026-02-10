/**
 * Coaching Decision Engine
 *
 * Rule-based triage (free, no AI cost) that determines what coaching action to take.
 * Output is a prioritized decision that gets formatted with AI (budget-gated).
 *
 * Decision types:
 * - health_alert: declining sleep/HRV
 * - task_followup: overdue or stalled tasks
 * - goal_coaching: off-track goals
 * - gap_probe: user hasn't engaged in X days
 * - engagement_reactivation: re-engage dormant user
 * - day_planning: morning plan based on tasks+calendar
 * - self_optimize: coaching is ineffective → propose self-modification
 */

import type { CoachingSignals } from "./signal-collector";
import { logger } from "@/lib/logger";

export type CoachingDecisionType =
  | "health_alert"
  | "task_followup"
  | "goal_coaching"
  | "gap_probe"
  | "engagement_reactivation"
  | "day_planning"
  | "self_optimize"
  | "skill_proposal"
  | "none";

export interface CoachingDecision {
  type: CoachingDecisionType;
  priority: number; // 1 = highest
  reason: string;
  data: Record<string, unknown>;
}

/**
 * Run rule-based triage on collected signals.
 * Returns the highest-priority decision, or { type: "none" } if nothing to do.
 */
export function triageCoachingDecision(
  signals: CoachingSignals,
): CoachingDecision {
  const decisions: CoachingDecision[] = [];

  // ── P1: Health Alert ──
  if (signals.sleepTrend === "declining") {
    decisions.push({
      type: "health_alert",
      priority: 1,
      reason: "Sleep trend declining over last 5+ days",
      data: {
        sleepTrend: signals.sleepTrend,
        lastScore: signals.lastSleepScore,
        lastHRV: signals.lastHRV,
      },
    });
  }

  if (signals.lastHRV !== null && signals.lastHRV < 30) {
    decisions.push({
      type: "health_alert",
      priority: 1,
      reason: `HRV critically low: ${signals.lastHRV}`,
      data: { lastHRV: signals.lastHRV },
    });
  }

  // ── P2: Task Followup ──
  if (signals.overdueTasks > 0) {
    decisions.push({
      type: "task_followup",
      priority: 2,
      reason: `${signals.overdueTasks} overdue tasks`,
      data: { overdueTasks: signals.overdueTasks },
    });
  }

  if (signals.stalledTasks >= 3) {
    decisions.push({
      type: "task_followup",
      priority: 3,
      reason: `${signals.stalledTasks} stalled tasks (pending > 3 days)`,
      data: { stalledTasks: signals.stalledTasks },
    });
  }

  // ── P3: Goal Coaching ──
  if (signals.offTrackGoals.length > 0) {
    decisions.push({
      type: "goal_coaching",
      priority: 3,
      reason: `${signals.offTrackGoals.length} off-track goals`,
      data: { goals: signals.offTrackGoals },
    });
  }

  // ── P4: Engagement Reactivation ──
  if (signals.messagesLast7d < 3 && signals.daysSinceLastMessage > 2) {
    decisions.push({
      type: "engagement_reactivation",
      priority: 4,
      reason: `Low engagement: ${signals.messagesLast7d} messages in 7 days`,
      data: { messagesLast7d: signals.messagesLast7d },
    });
  }

  // ── P5: Day Planning ──
  const hour = new Date().getHours();
  if (
    hour >= 6 &&
    hour <= 9 &&
    signals.totalPendingTasks > 0 &&
    signals.behaviorPresets.includes("plan_day")
  ) {
    decisions.push({
      type: "day_planning",
      priority: 5,
      reason: "Morning + pending tasks + plan_day preset active",
      data: { pendingTasks: signals.totalPendingTasks },
    });
  }

  // ── P6: Self-Optimize ──
  if (signals.recentFeedbackAvg !== null && signals.recentFeedbackAvg < 2.5) {
    decisions.push({
      type: "self_optimize",
      priority: 6,
      reason: `Low satisfaction: ${signals.recentFeedbackAvg.toFixed(1)}/5`,
      data: { feedbackAvg: signals.recentFeedbackAvg },
    });
  }

  // ── P7: Gap Probe ──
  // Only if proactivity is high enough and find_gaps preset is active
  if (
    signals.proactivity >= 50 &&
    signals.behaviorPresets.includes("find_gaps")
  ) {
    // Check if user has no goals
    if (signals.totalGoals === 0) {
      decisions.push({
        type: "gap_probe",
        priority: 7,
        reason: "No goals defined — possible blind spot",
        data: { totalGoals: 0 },
      });
    }
  }

  // ── Budget check ──
  if (signals.budgetUsedToday >= signals.dailyBudgetCents) {
    logger.info("[DecisionEngine] Budget exhausted, skipping coaching", {
      used: signals.budgetUsedToday,
      budget: signals.dailyBudgetCents,
    });
    return { type: "none", priority: 99, reason: "Budget exhausted", data: {} };
  }

  // Sort by priority (lowest number = highest priority)
  decisions.sort((a, b) => a.priority - b.priority);

  if (decisions.length === 0) {
    return {
      type: "none",
      priority: 99,
      reason: "No actionable signals",
      data: {},
    };
  }

  const best = decisions[0];
  logger.info("[DecisionEngine] Decision:", {
    type: best.type,
    priority: best.priority,
    reason: best.reason,
    candidateCount: decisions.length,
  });

  return best;
}

/**
 * Format a coaching decision into a user-facing message using AI.
 * Uses Tier 2 (Haiku) to stay budget-friendly.
 * Returns null if formatting fails or budget is insufficient.
 */
export async function formatCoachingMessage(
  decision: CoachingDecision,
  tenantName: string | null,
): Promise<string | null> {
  if (decision.type === "none") return null;

  // Rule-based fallback messages (no AI cost)
  const namePrefix = tenantName ? `${tenantName}, ` : "";

  switch (decision.type) {
    case "health_alert":
      return `${namePrefix}zauwazam spadek Twojego snu/zdrowia. ${decision.reason}. Moze sprobuj wczesniej isc spac dzis?`;

    case "task_followup":
      return `${namePrefix}masz ${decision.data.overdueTasks || decision.data.stalledTasks} zalegych zadan. Chcesz je przejrzec i ustalic priorytety?`;

    case "goal_coaching": {
      const goals = decision.data.goals as Array<{
        name: string;
        progress: number;
      }>;
      const goalNames = goals.map((g) => g.name).join(", ");
      return `${namePrefix}Twoje cele ${goalNames} wymagaja uwagi. Chcesz omowic plan dzialania?`;
    }

    case "engagement_reactivation":
      return `${namePrefix}dawno nie rozmawielismy. Jak sie masz? Moge pomoc z czyms?`;

    case "day_planning":
      return `${namePrefix}dzien dobry! Masz ${decision.data.pendingTasks} zadan na dzis. Chcesz zaplanujem Ci dzien?`;

    case "self_optimize":
      return null; // Self-optimize triggers internal tool use, not a message

    case "gap_probe":
      return `${namePrefix}zauwazylem ze nie masz zdefiniowanych celow. Chcesz ustalic jakis cel na ten miesiac?`;

    default:
      return null;
  }
}
