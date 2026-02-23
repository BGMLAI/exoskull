/**
 * MAPE-K Analyze Phase — detect issues, opportunities, and gaps.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  MonitorData,
  AnalyzeResult,
  PlanResult,
  InterventionPriority,
} from "./types";
import { logger } from "@/lib/logger";

/**
 * Analyze monitor data for issues, opportunities, and gaps (A phase of MAPE-K).
 */
export async function analyzeMonitorData(
  supabase: SupabaseClient,
  tenantId: string,
  monitorData: MonitorData,
): Promise<AnalyzeResult> {
  const issues: AnalyzeResult["issues"] = [];
  const opportunities: AnalyzeResult["opportunities"] = [];
  const recommendations: string[] = [];
  const gaps: AnalyzeResult["gaps"] = [];

  // 1. Analyze sleep
  if (monitorData.sleepHoursLast7d.length > 0) {
    const avgSleep =
      monitorData.sleepHoursLast7d.reduce((a, b) => a + b, 0) /
      monitorData.sleepHoursLast7d.length;
    if (avgSleep < 6) {
      issues.push({
        type: "sleep_debt",
        severity: avgSleep < 5 ? "high" : "medium",
        description: `Average sleep is ${avgSleep.toFixed(1)}h/night - below recommended 7-8h`,
        data: { avgSleep, sleepHoursLast7d: monitorData.sleepHoursLast7d },
      });
      recommendations.push(
        "Consider earlier bedtime or reducing screen time before sleep",
      );
    }
  } else {
    gaps.push({
      area: "health",
      description: "No sleep data recorded in the past week",
      lastMentioned: null,
      suggestedAction:
        "Connect a sleep tracker (Oura, Apple Watch) or log sleep manually",
    });
  }

  // 2. Analyze task overload
  if (monitorData.tasksOverdue > 5) {
    issues.push({
      type: "task_overload",
      severity: monitorData.tasksOverdue > 10 ? "high" : "medium",
      description: `${monitorData.tasksOverdue} overdue tasks need attention`,
      data: { overdueCount: monitorData.tasksOverdue },
    });
    recommendations.push(
      "Review and prioritize overdue tasks, consider delegating or rescheduling",
    );
  }

  // 3. Analyze activity
  if (monitorData.activityMinutesLast7d.length > 0) {
    const avgActivity =
      monitorData.activityMinutesLast7d.reduce((a, b) => a + b, 0) /
      monitorData.activityMinutesLast7d.length;
    if (avgActivity < 30) {
      issues.push({
        type: "health_concern",
        severity: "low",
        description: `Average daily activity is ${avgActivity.toFixed(0)} minutes - below 30 min recommendation`,
      });
    }
  }

  // 4. Check for social isolation
  if (monitorData.conversationsLast24h === 0) {
    const lastInteraction = monitorData.lastInteractionAt
      ? new Date(monitorData.lastInteractionAt)
      : null;
    if (
      !lastInteraction ||
      Date.now() - lastInteraction.getTime() > 3 * 24 * 60 * 60 * 1000
    ) {
      gaps.push({
        area: "social",
        description: "No interactions recorded in 3+ days",
        lastMentioned: monitorData.lastInteractionAt,
        suggestedAction: "Check in with user about their wellbeing",
      });
    }
  }

  // 5. Identify opportunities
  if (monitorData.recentPatterns.length > 0) {
    opportunities.push({
      type: "automation",
      description: "Patterns detected that could be automated",
      potentialImpact: 7,
      confidence: 0.8,
    });
  }

  // 6. Check rig connections
  if (monitorData.connectedRigs.length === 0) {
    gaps.push({
      area: "integrations",
      description: "No external services connected",
      lastMentioned: null,
      suggestedAction:
        "Connect Google Calendar, health trackers, or other services for richer insights",
    });
  }

  // 7. Emotion trend analysis (L11 data)
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { data: emotionEntries } = await supabase
      .from("exo_emotion_log")
      .select("valence")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayAgo.toISOString());

    if (emotionEntries && emotionEntries.length >= 3) {
      const negativeCount = emotionEntries.filter(
        (e) => (e.valence ?? 0) < -0.3,
      ).length;
      if (negativeCount >= 3) {
        issues.push({
          type: "health_concern",
          severity: negativeCount >= 5 ? "high" : "medium",
          description: `Negative emotion trend: ${negativeCount} negative entries in 24h`,
          data: { negativeCount, totalEntries: emotionEntries.length },
        });
        recommendations.push(
          "User may benefit from a wellness check-in or mood support",
        );
      }
    }
  } catch (err) {
    logger.warn(
      "[MAPE-K] Emotion data fetch failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // 8. Goal progress analysis (from monitorData — no extra DB call)
  if (monitorData.goalStatuses && monitorData.goalStatuses.length > 0) {
    for (const gs of monitorData.goalStatuses) {
      if (gs.trajectory === "off_track" || gs.trajectory === "at_risk") {
        // Correlate with detected issues: sleep_debt + health goal → escalate
        const relatedSleepIssue =
          gs.category === "health" &&
          issues.some((i) => i.type === "sleep_debt");
        const baseSeverity =
          gs.trajectory === "off_track"
            ? gs.wellbeingWeight > 2
              ? "high"
              : "medium"
            : "low";
        const severity =
          relatedSleepIssue && baseSeverity === "medium"
            ? "high"
            : baseSeverity;

        issues.push({
          type: "missed_goal",
          severity: severity as "low" | "medium" | "high",
          description: `Goal "${gs.name}" is ${gs.trajectory === "off_track" ? "off track" : "at risk"} (${Math.round(gs.progressPercent)}%)`,
          data: {
            goalId: gs.goalId,
            goalTitle: gs.name,
            trajectory: gs.trajectory,
            category: gs.category,
            progressPercent: gs.progressPercent,
            hasStrategy: gs.hasStrategy,
            needsStrategy: !gs.hasStrategy,
            relatedGoalId: gs.goalId,
          },
        });
      }

      // Detect goals with no strategy and off-track
      if (gs.trajectory === "off_track" && !gs.hasStrategy) {
        recommendations.push(
          `Goal "${gs.name}" needs a strategy — it's off track with no plan`,
        );
      }
    }
  }

  // 9. Productivity drop detection
  if (
    monitorData.tasksCreated < 2 &&
    monitorData.conversationsLast24h < 2 &&
    monitorData.energyLevel !== null &&
    monitorData.energyLevel < 5
  ) {
    issues.push({
      type: "productivity_drop",
      severity: "low",
      description: `Low activity detected: ${monitorData.tasksCreated} tasks, ${monitorData.conversationsLast24h} conversations, energy ${monitorData.energyLevel}/10`,
      data: {
        tasksCreated: monitorData.tasksCreated,
        conversations: monitorData.conversationsLast24h,
        energy: monitorData.energyLevel,
      },
    });
  }

  // 10. System health analysis (from system metrics)
  const sm = monitorData.systemMetrics;
  if (sm) {
    if (
      sm.interventionEffectiveness.approvalRate < 0.3 &&
      sm.interventionEffectiveness.approvalRate > 0
    ) {
      opportunities.push({
        type: "optimization",
        description: `Low intervention approval rate (${(sm.interventionEffectiveness.approvalRate * 100).toFixed(0)}%) — system may be over-intervening`,
        potentialImpact: 8,
        confidence: 0.85,
      });
    }

    if (sm.skillHealth.errorRate > 0.2 && sm.skillHealth.totalExecutions > 5) {
      issues.push({
        type: "custom",
        severity: sm.skillHealth.errorRate > 0.4 ? "high" : "medium",
        description: `Skill execution error rate at ${(sm.skillHealth.errorRate * 100).toFixed(0)}% (${sm.skillHealth.totalExecutions} executions this week)`,
        data: {
          errorRate: sm.skillHealth.errorRate,
          total: sm.skillHealth.totalExecutions,
        },
      });
    }
  }

  return {
    issues,
    opportunities,
    recommendations,
    gaps,
  };
}

/**
 * Plan a single intervention for a detected issue.
 */
export function planInterventionForIssue(
  issue: AnalyzeResult["issues"][0],
  hasAnyGrants: boolean,
): PlanResult["interventions"][0] | null {
  switch (issue.type) {
    case "sleep_debt":
      return {
        type: "health_alert",
        title: "Sleep debt detected",
        description: issue.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "sleep",
            message: `Your average sleep looks low (${issue.data?.avgSleep ? Number(issue.data.avgSleep).toFixed(1) + "h" : "below 6h"}). How did you sleep last night?`,
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: false,
        reasoning:
          "Sleep debt — ask about sleep quality instead of silent notification",
      };

    case "task_overload":
      return {
        type: "task_reminder",
        title: "Review and prioritize overdue tasks",
        description: issue.description,
        actionPayload: {
          action: "create_task",
          params: {
            title: `Review ${issue.data?.overdueCount || "overdue"} tasks and prioritize`,
            description: `${issue.description}. Suggested: cancel stale tasks, delegate what you can, reschedule the rest.`,
            priority: "high",
            labels: ["auto:mape-k", "meta-task"],
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: false,
        reasoning:
          "Task overload — create actionable meta-task instead of silent notification",
      };

    case "health_concern":
      return {
        type: "goal_nudge",
        title: "Activity reminder",
        description: issue.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "activity",
            message: "Would you like to log some activity today?",
          },
        },
        priority: "low",
        requiresApproval: false, // Low-risk: check-in trigger — Guardian check still applies
        reasoning: "Low activity may benefit from gentle nudge",
      };

    case "missed_goal":
      return {
        type: "goal_nudge",
        title: `Goal strategy needed: ${issue.data?.goalTitle || "unknown"}`,
        description: issue.description,
        actionPayload: {
          action: "goal_strategy",
          params: {
            goalId: issue.data?.goalId,
            goalTitle: issue.data?.goalTitle,
            trajectory: issue.data?.trajectory,
            category: issue.data?.category,
            needsStrategy: issue.data?.needsStrategy || false,
            phase: issue.data?.needsStrategy ? "generate" : "auto",
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: false,
        reasoning: issue.data?.needsStrategy
          ? "Goal off-track with NO strategy — trigger strategy generation"
          : "Goal off-track — generating/executing realization strategy",
      };

    case "productivity_drop":
      return {
        type: "proactive_message",
        title: "Energy and activity check-in",
        description: issue.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "energy",
            message:
              "Noticed low activity today. How's your energy? Sometimes a short walk or change of scenery helps.",
          },
        },
        priority: "low",
        requiresApproval: false,
        reasoning:
          "Low activity + low energy — trigger energy check-in instead of silent notification",
      };

    case "social_isolation":
      return {
        type: "proactive_message",
        title: "Social connection reminder",
        description: issue.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "social",
            message:
              "It's been a while since we chatted. Want to talk about how things are going?",
          },
        },
        priority: "low",
        requiresApproval: false, // Low-risk: check-in trigger — Guardian check still applies
        reasoning: "Extended isolation may affect wellbeing",
      };

    default:
      return null;
  }
}
