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

  // 8. Goal progress analysis (L9 data)
  try {
    const { data: atRiskGoals } = await supabase
      .from("exo_user_goals")
      .select("title, trajectory, wellbeing_weight, category")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("trajectory", ["off_track", "at_risk"]);

    if (atRiskGoals && atRiskGoals.length > 0) {
      for (const goal of atRiskGoals) {
        issues.push({
          type: "missed_goal",
          severity:
            goal.trajectory === "off_track"
              ? (goal.wellbeing_weight || 0) > 7
                ? "high"
                : "medium"
              : "low",
          description: `Goal "${goal.title}" is ${goal.trajectory === "off_track" ? "off track" : "at risk"}`,
          data: {
            goalTitle: goal.title,
            trajectory: goal.trajectory,
            category: goal.category,
          },
        });
      }
    }
  } catch (err) {
    logger.warn(
      "[MAPE-K] Goal data fetch failed:",
      err instanceof Error ? err.message : err,
    );
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
          action: "send_notification",
          params: {
            title: "Sleep Alert",
            body: issue.description,
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: !hasAnyGrants,
        reasoning: "Sleep debt can impact health and productivity",
      };

    case "task_overload":
      return {
        type: "task_reminder",
        title: "Overdue tasks need attention",
        description: issue.description,
        actionPayload: {
          action: "send_notification",
          params: {
            title: "Task Overload",
            body: issue.description,
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: !hasAnyGrants,
        reasoning: "Many overdue tasks may indicate need for prioritization",
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
        requiresApproval: !hasAnyGrants,
        reasoning: "Low activity may benefit from gentle nudge",
      };

    case "missed_goal":
      return {
        type: "goal_nudge",
        title: `Goal needs attention: ${issue.data?.goalTitle || "unknown"}`,
        description: issue.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "goal_review",
            message: `Your goal "${issue.data?.goalTitle}" seems to be falling behind. Want to review it?`,
          },
        },
        priority: issue.severity === "high" ? "high" : "medium",
        requiresApproval: !hasAnyGrants,
        reasoning: "Goal off-track or at-risk — user may benefit from review",
      };

    case "productivity_drop":
      return {
        type: "proactive_message",
        title: "Energy and activity check-in",
        description: issue.description,
        actionPayload: {
          action: "send_notification",
          params: {
            title: "How are you doing?",
            body: "Noticed low activity today. Everything okay? Sometimes a short walk helps.",
          },
        },
        priority: "low",
        requiresApproval: !hasAnyGrants,
        reasoning: "Low activity + low energy may indicate user needs support",
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
        requiresApproval: !hasAnyGrants,
        reasoning: "Extended isolation may affect wellbeing",
      };

    default:
      return null;
  }
}
