/**
 * Self-Optimizer Agent
 *
 * Learns from execution history and optimizes system behavior.
 * Analyzes intervention feedback, agent performance, and user preferences.
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
import { getTasks } from "@/lib/tasks/task-service";
import type { Task } from "@/lib/tasks/task-service";
import {
  OptimizationTarget,
  OptimizationResult,
  LearningInsight,
} from "../../autonomy/types";

// ============================================================================
// SELF-OPTIMIZER AGENT
// ============================================================================

export class SelfOptimizerAgent extends BaseAgent {
  readonly id = "self-optimizer";
  readonly name = "Self Optimizer";
  readonly tier: AgentTier = AGENT_TIERS.DEEP;
  readonly capabilities = [
    "self_optimization",
    "learning",
    "performance_tuning",
    "feedback_analysis",
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

    // Only run weekly (Sunday night) or when forced
    if (
      !(environment.dayOfWeek === 0 && environment.timeOfDay === "night") &&
      !this.context.metadata?.forceRun
    ) {
      logger.info("[SelfOptimizer] Skipping - not Sunday night and not forced");
      return [];
    }

    // Need sufficient data to optimize
    if (resources.availableData.conversations < 10) {
      logger.info(
        "[SelfOptimizer] Skipping - insufficient data for optimization",
      );
      return [];
    }

    decisions.push({
      action: "optimize_system",
      confidence: 0.85,
      reasoning: "Weekly self-optimization cycle to improve system performance",
      params: {
        analysisWindow: 7, // days
        minSampleSize: 5,
      },
      urgency: "background",
      requiredTier: AGENT_TIERS.DEEP,
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
      if (decision.action !== "optimize_system") {
        return {
          success: false,
          action: decision.action,
          error: `Unknown action: ${decision.action}`,
          metrics: { durationMs: Date.now() - startTime },
        };
      }

      const analysisWindow = (decision.params.analysisWindow as number) || 7;

      // 1. Analyze intervention feedback
      const feedbackInsights = await this.analyzeFeedback(
        this.context.tenantId,
        analysisWindow,
      );

      // 2. Analyze agent performance
      const performanceInsights = await this.analyzeAgentPerformance(
        this.context.tenantId,
        analysisWindow,
      );

      // 3. Analyze user patterns
      const patternInsights = await this.analyzeUserPatterns(
        this.context.tenantId,
        analysisWindow,
      );

      // 4. Generate optimization recommendations
      const optimizations = await this.generateOptimizations(
        feedbackInsights,
        performanceInsights,
        patternInsights,
      );

      // 5. Apply safe optimizations
      const appliedOptimizations = await this.applyOptimizations(
        this.context.tenantId,
        optimizations,
      );

      // 6. Store learning events
      await this.storeLearnings(this.context.tenantId, [
        ...feedbackInsights,
        ...performanceInsights,
        ...patternInsights,
      ]);

      this.status = "completed";

      const result: ExecutionResult = {
        success: true,
        action: "optimize_system",
        data: {
          feedbackInsights: feedbackInsights.length,
          performanceInsights: performanceInsights.length,
          patternInsights: patternInsights.length,
          optimizationsGenerated: optimizations.length,
          optimizationsApplied: appliedOptimizations,
          insights: [
            ...feedbackInsights.slice(0, 3),
            ...performanceInsights.slice(0, 3),
            ...patternInsights.slice(0, 3),
          ].map((i) => i.description),
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
  // FEEDBACK ANALYSIS
  // ============================================================================

  private async analyzeFeedback(
    tenantId: string,
    days: number,
  ): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Get intervention stats by type
    const { data: stats } = await this.supabase.rpc("get_intervention_stats", {
      p_tenant_id: tenantId,
      p_days: days,
    });

    if (!stats || stats.length === 0) {
      return insights;
    }

    for (const stat of stats as any[]) {
      // Check approval rate
      if (stat.total_proposed > 5) {
        if (stat.approval_rate < 0.3) {
          insights.push({
            type: "optimization",
            description: `Intervention type "${stat.intervention_type}" has ${(stat.approval_rate * 100).toFixed(0)}% approval rate - consider reducing frequency or improving relevance`,
            confidence: 0.8,
            actionable: true,
            suggestedAction: `reduce_intervention_frequency:${stat.intervention_type}`,
            data: stat,
          });
        } else if (stat.approval_rate > 0.8) {
          insights.push({
            type: "pattern",
            description: `Intervention type "${stat.intervention_type}" has high approval (${(stat.approval_rate * 100).toFixed(0)}%) - user finds these valuable`,
            confidence: 0.85,
            actionable: false,
            data: stat,
          });
        }
      }

      // Check feedback quality
      if (stat.total_helpful > stat.total_unhelpful * 2) {
        insights.push({
          type: "preference",
          description: `User finds "${stat.intervention_type}" interventions helpful (${stat.total_helpful} helpful vs ${stat.total_unhelpful} unhelpful)`,
          confidence: 0.75,
          actionable: false,
          data: {
            type: stat.intervention_type,
            ratio: stat.total_helpful / Math.max(1, stat.total_unhelpful),
          },
        });
      } else if (stat.total_unhelpful > stat.total_helpful) {
        insights.push({
          type: "warning",
          description: `User finds "${stat.intervention_type}" interventions unhelpful - consider disabling or improving`,
          confidence: 0.7,
          actionable: true,
          suggestedAction: `review_intervention_type:${stat.intervention_type}`,
          data: stat,
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // AGENT PERFORMANCE ANALYSIS
  // ============================================================================

  private async analyzeAgentPerformance(
    tenantId: string,
    days: number,
  ): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Get agent execution stats
    const { data: stats } = await this.supabase.rpc("get_agent_stats", {
      p_tenant_id: tenantId,
      p_days: days,
    });

    if (!stats || stats.length === 0) {
      return insights;
    }

    for (const stat of stats as any[]) {
      const successRate = stat.successful_runs / Math.max(1, stat.total_runs);

      // Check success rate
      if (stat.total_runs > 3) {
        if (successRate < 0.5) {
          insights.push({
            type: "warning",
            description: `Agent "${stat.agent_id}" has ${(successRate * 100).toFixed(0)}% success rate - needs investigation`,
            confidence: 0.85,
            actionable: true,
            suggestedAction: `investigate_agent:${stat.agent_id}`,
            data: stat,
          });
        } else if (successRate > 0.95) {
          insights.push({
            type: "pattern",
            description: `Agent "${stat.agent_id}" performing well (${(successRate * 100).toFixed(0)}% success rate)`,
            confidence: 0.9,
            actionable: false,
            data: stat,
          });
        }
      }

      // Check token efficiency
      if (stat.total_tokens > 10000) {
        const avgTokens = stat.total_tokens / stat.total_runs;
        if (avgTokens > 2000) {
          insights.push({
            type: "optimization",
            description: `Agent "${stat.agent_id}" uses ${avgTokens.toFixed(0)} tokens/run on average - consider optimization`,
            confidence: 0.7,
            actionable: true,
            suggestedAction: `optimize_agent_tokens:${stat.agent_id}`,
            data: { avgTokens, totalTokens: stat.total_tokens },
          });
        }
      }

      // Check execution time
      if (stat.avg_duration_ms > 30000) {
        insights.push({
          type: "optimization",
          description: `Agent "${stat.agent_id}" averages ${(stat.avg_duration_ms / 1000).toFixed(1)}s execution time - might need optimization`,
          confidence: 0.6,
          actionable: true,
          suggestedAction: `optimize_agent_speed:${stat.agent_id}`,
          data: { avgDurationMs: stat.avg_duration_ms },
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // USER PATTERN ANALYSIS
  // ============================================================================

  private async analyzeUserPatterns(
    tenantId: string,
    days: number,
  ): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Analyze conversation timing patterns
    const { data: conversations } = await this.supabase
      .from("exo_conversations")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoff.toISOString());

    if (conversations && conversations.length > 10) {
      const hourCounts = new Map<number, number>();
      for (const conv of conversations) {
        const hour = new Date(conv.created_at).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }

      // Find peak hours
      let peakHour = 0;
      let peakCount = 0;
      for (const [hour, count] of hourCounts) {
        if (count > peakCount) {
          peakHour = hour;
          peakCount = count;
        }
      }

      if (peakCount > conversations.length * 0.2) {
        insights.push({
          type: "pattern",
          description: `User most active around ${peakHour}:00 (${peakCount} of ${conversations.length} interactions)`,
          confidence: 0.75,
          actionable: true,
          suggestedAction: `schedule_check_ins_near:${peakHour}`,
          data: {
            peakHour,
            peakCount,
            totalConversations: conversations.length,
          },
        });
      }

      // Check for quiet hours being violated
      const lateNightCount = [...hourCounts.entries()]
        .filter(([h]) => h >= 23 || h < 6)
        .reduce((sum, [, c]) => sum + c, 0);

      if (lateNightCount < conversations.length * 0.05) {
        insights.push({
          type: "preference",
          description:
            "User rarely interacts late night (11PM-6AM) - respect quiet hours",
          confidence: 0.8,
          actionable: false,
          data: {
            lateNightPercent: (
              (lateNightCount / conversations.length) *
              100
            ).toFixed(1),
          },
        });
      }
    }

    // Analyze task completion patterns
    const allDoneTasks = await getTasks(
      tenantId,
      { status: "done" },
      this.supabase,
    );
    const tasks = allDoneTasks.filter(
      (t: Task) => t.completed_at !== null && new Date(t.created_at) >= cutoff,
    );

    if (tasks && tasks.length > 5) {
      // Calculate average completion time
      const completionTimes = tasks.map((t: Task) => {
        const created = new Date(t.created_at).getTime();
        const completed = new Date(t.completed_at!).getTime();
        return (completed - created) / (1000 * 60 * 60); // hours
      });

      const avgCompletionTime =
        completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;

      if (avgCompletionTime > 48) {
        insights.push({
          type: "pattern",
          description: `Tasks take ${avgCompletionTime.toFixed(0)} hours on average to complete - consider breaking into smaller tasks`,
          confidence: 0.65,
          actionable: true,
          suggestedAction: "suggest_task_breakdown",
          data: { avgCompletionTimeHours: avgCompletionTime },
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // OPTIMIZATION GENERATION
  // ============================================================================

  private async generateOptimizations(
    feedbackInsights: LearningInsight[],
    performanceInsights: LearningInsight[],
    patternInsights: LearningInsight[],
  ): Promise<OptimizationResult[]> {
    const optimizations: OptimizationResult[] = [];
    const allInsights = [
      ...feedbackInsights,
      ...performanceInsights,
      ...patternInsights,
    ];

    for (const insight of allInsights) {
      if (!insight.actionable || !insight.suggestedAction) continue;

      const [action, target] = insight.suggestedAction.split(":");

      switch (action) {
        case "reduce_intervention_frequency":
          optimizations.push({
            target: {
              type: "intervention",
              targetId: target,
              metric: "user_satisfaction",
              currentValue: 0,
              targetValue: 0.5,
            },
            action: "adjust",
            reasoning: insight.description,
            changes: { frequencyMultiplier: 0.5 },
          });
          break;

        case "review_intervention_type":
          optimizations.push({
            target: {
              type: "intervention",
              targetId: target,
              metric: "user_satisfaction",
              currentValue: 0,
              targetValue: 0.5,
            },
            action: "disable",
            reasoning: insight.description,
          });
          break;

        case "schedule_check_ins_near":
          optimizations.push({
            target: {
              type: "schedule",
              targetId: "check_in_time",
              metric: "engagement",
              currentValue: 0,
              targetValue: 0.8,
            },
            action: "adjust",
            reasoning: insight.description,
            changes: { preferredHour: parseInt(target) },
          });
          break;

        case "optimize_agent_tokens":
        case "optimize_agent_speed":
          optimizations.push({
            target: {
              type: "agent",
              targetId: target,
              metric:
                action === "optimize_agent_tokens"
                  ? "response_time"
                  : "response_time",
              currentValue: 0,
              targetValue: 0.8,
            },
            action: "enhance",
            reasoning: insight.description,
          });
          break;
      }
    }

    return optimizations;
  }

  // ============================================================================
  // APPLY OPTIMIZATIONS
  // ============================================================================

  private async applyOptimizations(
    tenantId: string,
    optimizations: OptimizationResult[],
  ): Promise<number> {
    let applied = 0;

    for (const opt of optimizations) {
      // Only apply safe optimizations automatically
      if (opt.action === "no_change") continue;

      // Adjustments are safe to apply
      if (opt.action === "adjust" && opt.target.type === "schedule") {
        // Store scheduling preference
        try {
          await this.supabase.from("user_patterns").upsert(
            {
              tenant_id: tenantId,
              pattern_type: "productivity",
              description: `Preferred interaction time: ${opt.changes?.preferredHour}:00`,
              frequency: "daily",
              confidence: 0.75,
              data_points: 1,
              suggested_automation: JSON.stringify(opt.changes),
              automation_enabled: true,
              status: "active",
              last_detected: new Date().toISOString(),
            },
            {
              onConflict: "tenant_id,pattern_type,description",
            },
          );
          applied++;
        } catch (error) {
          logger.error("[SelfOptimizer] Failed to store pattern:", error);
        }
      }

      // Disable actions need user approval - create intervention
      if (opt.action === "disable") {
        try {
          await this.supabase.rpc("propose_intervention", {
            p_tenant_id: tenantId,
            p_type: "pattern_notification",
            p_title: `Optimization suggestion: ${opt.target.targetId}`,
            p_description: opt.reasoning,
            p_action_payload: {
              action: "custom",
              params: { optimization: opt },
            },
            p_priority: "low",
            p_source_agent: this.id,
            p_requires_approval: true,
            p_scheduled_for: null,
          });
          applied++;
        } catch (error) {
          logger.error(
            "[SelfOptimizer] Failed to create optimization intervention:",
            error,
          );
        }
      }
    }

    return applied;
  }

  // ============================================================================
  // STORE LEARNINGS
  // ============================================================================

  private async storeLearnings(
    tenantId: string,
    insights: LearningInsight[],
  ): Promise<void> {
    // Store significant insights
    const significantInsights = insights.filter(
      (i) =>
        i.confidence > 0.7 && (i.type === "pattern" || i.type === "preference"),
    );

    for (const insight of significantInsights) {
      try {
        await this.supabase.from("learning_events").insert({
          tenant_id: tenantId,
          event_type:
            insight.type === "pattern" ? "pattern_detected" : "highlight_added",
          data: {
            insight: insight.description,
            confidence: insight.confidence,
            type: insight.type,
            actionable: insight.actionable,
            data: insight.data,
          },
          agent_id: this.id,
        });
      } catch (error) {
        logger.error("[SelfOptimizer] Failed to store learning:", error);
      }
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

export async function optimizeSystem(
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

  const agent = new SelfOptimizerAgent(context);

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
