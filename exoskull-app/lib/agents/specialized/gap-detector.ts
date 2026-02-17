/**
 * Gap Detector Agent
 *
 * Detects blind spots - areas of life the user doesn't talk about or track.
 * Proactively identifies missing data and suggests tracking.
 */

import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  AGENT_TIERS,
} from "../types";
import { BaseAgent } from "../core/base-agent";
import { logger } from "@/lib/logger";
import { GapAnalysis, LIFE_AREAS, LifeArea } from "../../autonomy/types";

// ============================================================================
// GAP DETECTOR AGENT
// ============================================================================

export class GapDetectorAgent extends BaseAgent {
  readonly id = "gap-detector";
  readonly name = "Gap Detector";
  readonly tier: AgentTier = AGENT_TIERS.BALANCED;
  readonly capabilities = [
    "gap_detection",
    "blind_spot_analysis",
    "coverage_analysis",
  ];

  constructor(context: AgentContext) {
    super(context);
  }

  // ============================================================================
  // DECIDE
  // ============================================================================

  async decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    _context?: AgentContext,
  ): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // Only run weekly or when specifically triggered
    if (
      environment.dayOfWeek !== 0 && // Sunday
      !this.context.metadata?.forceRun
    ) {
      logger.info("[GapDetector] Skipping - not Sunday and not forced");
      return [];
    }

    // Check if we have enough data to analyze
    if (resources.availableData.conversations < 5) {
      logger.info("[GapDetector] Skipping - insufficient conversation data");
      return [];
    }

    // Decide to run gap analysis
    decisions.push({
      action: "analyze_gaps",
      confidence: 0.9,
      reasoning: "Weekly gap analysis to identify blind spots",
      params: {
        areas: LIFE_AREAS.map((a) => a.slug),
        lookbackDays: 30,
      },
      urgency: "background",
      requiredTier: AGENT_TIERS.BALANCED,
    });

    return decisions;
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.status = "running";

    try {
      if (decision.action !== "analyze_gaps") {
        return {
          success: false,
          action: decision.action,
          error: `Unknown action: ${decision.action}`,
          metrics: { durationMs: Date.now() - startTime },
        };
      }

      const lookbackDays = (decision.params.lookbackDays as number) || 30;
      const gaps = await this.analyzeAllGaps(
        this.context.tenantId,
        lookbackDays,
      );

      // Filter to significant gaps only
      const significantGaps = gaps.filter((g) => g.severity !== "none");

      // Create interventions for severe gaps
      const interventionsCreated = await this.createGapInterventions(
        this.context.tenantId,
        significantGaps,
      );

      // Store gap analysis results
      await this.storeGapAnalysis(this.context.tenantId, gaps);

      this.status = "completed";

      const result: ExecutionResult = {
        success: true,
        action: "analyze_gaps",
        data: {
          totalAreas: LIFE_AREAS.length,
          gapsDetected: significantGaps.length,
          severeGaps: gaps.filter((g) => g.severity === "severe").length,
          moderateGaps: gaps.filter((g) => g.severity === "moderate").length,
          mildGaps: gaps.filter((g) => g.severity === "mild").length,
          interventionsCreated,
          gaps: significantGaps.map((g) => ({
            area: g.area.name,
            severity: g.severity,
            daysSinceActivity: g.daysSinceActivity,
            coveragePercent: g.coveragePercent,
          })),
        },
        metrics: {
          durationMs: Date.now() - startTime,
          tier: this.tier,
        },
      };

      await this.logExecution(decision, result);
      return result;
    } catch (error) {
      this.status = "failed";
      const errorMsg = error instanceof Error ? error.message : String(error);

      const result: ExecutionResult = {
        success: false,
        action: decision.action,
        error: errorMsg,
        metrics: { durationMs: Date.now() - startTime },
      };

      await this.logExecution(decision, result, errorMsg);
      return result;
    }
  }

  // ============================================================================
  // GAP ANALYSIS
  // ============================================================================

  private async analyzeAllGaps(
    tenantId: string,
    lookbackDays: number,
  ): Promise<GapAnalysis[]> {
    const gaps: GapAnalysis[] = [];

    for (const area of LIFE_AREAS) {
      const gap = await this.analyzeGap(tenantId, area, lookbackDays);
      gaps.push(gap);
    }

    return gaps;
  }

  private async analyzeGap(
    tenantId: string,
    area: LifeArea,
    lookbackDays: number,
  ): Promise<GapAnalysis> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
    const cutoffIso = cutoffDate.toISOString();

    // Count activity based on data points
    let activityCount = 0;
    let lastActivity: string | null = null;

    for (const dataPoint of area.dataPoints) {
      const { count, latest } = await this.countDataPoint(
        tenantId,
        dataPoint,
        cutoffIso,
      );
      activityCount += count;
      if (latest && (!lastActivity || latest > lastActivity)) {
        lastActivity = latest;
      }
    }

    // Calculate expected count based on tracking frequency
    const expectedCount = this.calculateExpectedCount(
      area.trackingFrequency,
      lookbackDays,
    );
    const coveragePercent =
      expectedCount > 0
        ? Math.min(100, Math.round((activityCount / expectedCount) * 100))
        : 0;

    // Calculate days since activity
    const daysSinceActivity = lastActivity
      ? Math.floor(
          (Date.now() - new Date(lastActivity).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

    // Determine severity
    const severity = this.calculateSeverity(
      area.trackingFrequency,
      daysSinceActivity,
      coveragePercent,
    );

    // Generate suggested intervention
    const suggestedIntervention =
      severity !== "none"
        ? this.generateSuggestion(area, severity, daysSinceActivity)
        : null;

    return {
      area,
      lastActivity,
      daysSinceActivity,
      activityCount30d: activityCount,
      expectedCount30d: expectedCount,
      coveragePercent,
      severity,
      suggestedIntervention,
    };
  }

  private async countDataPoint(
    tenantId: string,
    dataPoint: string,
    cutoffDate: string,
  ): Promise<{ count: number; latest: string | null }> {
    // Map data points to tables
    const tableMap: Record<
      string,
      { table: string; tenantCol: string; dateCol: string }
    > = {
      sleep_entries: {
        table: "exo_sleep_entries",
        tenantCol: "tenant_id",
        dateCol: "sleep_date",
      },
      activity_entries: {
        table: "exo_activity_entries",
        tenantCol: "tenant_id",
        dateCol: "entry_date",
      },
      health_checkins: {
        table: "exo_user_checkins",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
      mood_entries: {
        table: "exo_mood_entries",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
      tasks_completed: {
        table: "exo_tasks",
        tenantCol: "tenant_id",
        dateCol: "completed_at",
      },
      social_events: {
        table: "exo_conversations",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
      transactions: {
        table: "exo_transactions",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
      journal_entries: {
        table: "user_notes",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
      meditation_sessions: {
        table: "exo_meditation_sessions",
        tenantCol: "tenant_id",
        dateCol: "created_at",
      },
    };

    const mapping = tableMap[dataPoint];
    if (!mapping) {
      // Unknown data point - count from conversations mentioning the topic
      return this.countConversationMentions(tenantId, dataPoint, cutoffDate);
    }

    try {
      const { count } = await this.supabase
        .from(mapping.table)
        .select("*", { count: "exact", head: true })
        .eq(mapping.tenantCol, tenantId)
        .gte(mapping.dateCol, cutoffDate);

      const { data: latest } = await this.supabase
        .from(mapping.table)
        .select(mapping.dateCol)
        .eq(mapping.tenantCol, tenantId)
        .order(mapping.dateCol, { ascending: false })
        .limit(1)
        .single();

      return {
        count: count || 0,
        latest: (latest as any)?.[mapping.dateCol] || null,
      };
    } catch {
      // Table might not exist
      return { count: 0, latest: null };
    }
  }

  private async countConversationMentions(
    tenantId: string,
    topic: string,
    cutoffDate: string,
  ): Promise<{ count: number; latest: string | null }> {
    // Use text search in conversations
    const { data } = await this.supabase
      .from("exo_conversations")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoffDate)
      .textSearch("context", topic, { type: "plain" })
      .order("created_at", { ascending: false });

    return {
      count: data?.length || 0,
      latest: data?.[0]?.created_at || null,
    };
  }

  private calculateExpectedCount(
    frequency: "daily" | "weekly" | "monthly" | "on_demand",
    lookbackDays: number,
  ): number {
    switch (frequency) {
      case "daily":
        return lookbackDays;
      case "weekly":
        return Math.floor(lookbackDays / 7);
      case "monthly":
        return Math.floor(lookbackDays / 30);
      case "on_demand":
        return Math.floor(lookbackDays / 14); // Expect some activity every 2 weeks
    }
  }

  private calculateSeverity(
    frequency: "daily" | "weekly" | "monthly" | "on_demand",
    daysSinceActivity: number | null,
    coveragePercent: number,
  ): "none" | "mild" | "moderate" | "severe" {
    if (daysSinceActivity === null) {
      // Never tracked this area
      return "severe";
    }

    // Thresholds based on frequency
    const thresholds: Record<
      string,
      { mild: number; moderate: number; severe: number }
    > = {
      daily: { mild: 3, moderate: 7, severe: 14 },
      weekly: { mild: 14, moderate: 21, severe: 30 },
      monthly: { mild: 45, moderate: 60, severe: 90 },
      on_demand: { mild: 21, moderate: 30, severe: 45 },
    };

    const t = thresholds[frequency];

    // Consider both days since activity and coverage
    if (daysSinceActivity >= t.severe || coveragePercent < 20) {
      return "severe";
    }
    if (daysSinceActivity >= t.moderate || coveragePercent < 40) {
      return "moderate";
    }
    if (daysSinceActivity >= t.mild || coveragePercent < 60) {
      return "mild";
    }

    return "none";
  }

  private generateSuggestion(
    area: LifeArea,
    severity: "mild" | "moderate" | "severe",
    daysSinceActivity: number | null,
  ): string {
    const timeMsg = daysSinceActivity
      ? `It's been ${daysSinceActivity} days since any activity.`
      : "No data has been recorded yet.";

    const suggestions: Record<string, Record<string, string>> = {
      health: {
        mild: `Your health tracking has been inconsistent. ${timeMsg} Consider logging a quick update.`,
        moderate: `Health data is getting sparse. ${timeMsg} A brief check-in would help maintain insights.`,
        severe: `No health tracking detected. ${timeMsg} Would you like to set up health monitoring?`,
      },
      productivity: {
        mild: `Task tracking has gaps. ${timeMsg} Recording completed tasks helps measure progress.`,
        moderate: `Productivity data is limited. ${timeMsg} Consider reviewing your task list.`,
        severe: `No productivity tracking found. ${timeMsg} Want help setting up task management?`,
      },
      finance: {
        mild: `Financial tracking could use attention. ${timeMsg}`,
        moderate: `Financial data is getting stale. ${timeMsg} A quick expense log would help.`,
        severe: `No financial tracking detected. ${timeMsg} Would you like to start tracking expenses?`,
      },
      social: {
        mild: `Social activity tracking is light. ${timeMsg} Consider noting recent interactions.`,
        moderate: `Limited social data. ${timeMsg} Logging connections helps track relationships.`,
        severe: `No social activity recorded. ${timeMsg} How are your relationships doing?`,
      },
      mental: {
        mild: `Mental health check-ins have been sparse. ${timeMsg}`,
        moderate: `Mental health data needs attention. ${timeMsg} How are you feeling lately?`,
        severe: `No mental health tracking found. ${timeMsg} Would a mood check-in help?`,
      },
      learning: {
        mild: `Learning activities are lightly tracked. ${timeMsg}`,
        moderate: `Learning progress data is limited. ${timeMsg} What have you been exploring?`,
        severe: `No learning activities recorded. ${timeMsg} Want to track educational progress?`,
      },
      creativity: {
        mild: `Creative activities could use more tracking. ${timeMsg}`,
        moderate: `Creative data is sparse. ${timeMsg} What projects are you working on?`,
        severe: `No creative activities found. ${timeMsg} Missing this area of life?`,
      },
    };

    return (
      suggestions[area.slug]?.[severity] ||
      `Gap detected in ${area.name}. ${timeMsg}`
    );
  }

  // ============================================================================
  // INTERVENTIONS
  // ============================================================================

  private async createGapInterventions(
    tenantId: string,
    gaps: GapAnalysis[],
  ): Promise<number> {
    let count = 0;

    for (const gap of gaps) {
      if (gap.severity === "none" || !gap.suggestedIntervention) continue;

      // Only create interventions for moderate/severe gaps
      if (gap.severity === "mild") continue;

      try {
        // Standard check-in intervention for all moderate/severe gaps
        await this.supabase.rpc("propose_intervention", {
          p_tenant_id: tenantId,
          p_type: "gap_detection",
          p_title: `Blind spot: ${gap.area.name}`,
          p_description: gap.suggestedIntervention,
          p_action_payload: {
            action: "trigger_checkin",
            params: {
              checkinType: gap.area.slug,
              message: gap.suggestedIntervention,
            },
          },
          p_priority: gap.severity === "severe" ? "high" : "medium",
          p_source_agent: this.id,
          p_requires_approval: true,
          p_scheduled_for: null,
        });
        count++;

        // For severe gaps: also propose building a tracker app
        if (gap.severity === "severe") {
          await this.supabase.rpc("propose_intervention", {
            p_tenant_id: tenantId,
            p_type: "build_app",
            p_title: `Build tracker: ${gap.area.name}`,
            p_description: `Severe blind spot detected in ${gap.area.name} (${gap.coveragePercent}% coverage, ${gap.daysSinceActivity}+ days without activity). Build a simple ${gap.area.slug} tracker to help monitor this area.`,
            p_action_payload: {
              action: "build_app",
              params: {
                description: `Simple ${gap.area.name} tracker — log entries, view timeline, track ${gap.area.slug} activities. Auto-detected blind spot with ${gap.coveragePercent}% coverage.`,
                area_slug: gap.area.slug,
                area_name: gap.area.name,
              },
            },
            p_priority: "high",
            p_source_agent: this.id,
            p_requires_approval: true, // Building an app requires user approval
            p_scheduled_for: null,
          });
          count++;
          logger.info(
            `[GapDetector] Proposed build_app for severe gap: ${gap.area.slug}`,
          );
        }
      } catch (error) {
        logger.error(
          `[GapDetector] Failed to create intervention for ${gap.area.slug}:`,
          error,
        );
      }
    }

    return count;
  }

  private async storeGapAnalysis(
    tenantId: string,
    gaps: GapAnalysis[],
  ): Promise<void> {
    await this.supabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: "pattern_detected",
      data: {
        type: "gap_analysis",
        gaps: gaps.map((g) => ({
          area: g.area.slug,
          severity: g.severity,
          coveragePercent: g.coveragePercent,
          daysSinceActivity: g.daysSinceActivity,
        })),
        analyzedAt: new Date().toISOString(),
      },
      agent_id: this.id,
    });
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

export async function detectGaps(
  tenantId: string,
  forceRun = false,
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  const context: AgentContext = {
    tenantId,
    depth: 0,
    startedAt: new Date().toISOString(),
    metadata: { forceRun },
  };

  const agent = new GapDetectorAgent(context);

  try {
    await agent.onSpawn?.();

    const resources = await agent.analyzeResources(tenantId);
    const environment = await agent.analyzeEnvironment(tenantId);
    const decisions = await agent.decide(resources, environment, context);

    if (decisions.length === 0) {
      return { success: true, result: { action: "no_action_needed" } };
    }

    const result = await agent.execute(decisions[0]);

    return {
      success: result.success,
      result: result.data,
      error: result.error,
    };
  } finally {
    await agent.onRelease?.();
  }
}
