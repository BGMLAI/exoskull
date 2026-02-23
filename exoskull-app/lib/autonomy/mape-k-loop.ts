/**
 * MAPE-K Autonomic Loop
 *
 * Monitor -> Analyze -> Plan -> Execute -> Knowledge
 *
 * Core autonomic computing loop for ExoSkull.
 * Continuously observes, analyzes, plans interventions, and learns.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  MonitorData,
  AnalyzeResult,
  PlanResult,
  ExecuteResult,
  KnowledgeResult,
  MAPEKCycleResult,
  InterventionPriority,
} from "./types";
import { getActionExecutor } from "./action-executor";
import { getPermissionModel } from "./permission-model";
import { getAlignmentGuardian } from "./guardian";
import { collectMonitorData } from "./mape-k-monitor";
import { analyzeMonitorData, planInterventionForIssue } from "./mape-k-analyze";

import { analyzeRecentOutcomes } from "./outcome-tracker";
import { learnFromOutcomes } from "./learning-engine";
import { findOptimalDeliveryTime } from "./timing-optimizer";
import { logger } from "@/lib/logger";

// ============================================================================
// MAPE-K LOOP CLASS
// ============================================================================

export class MAPEKLoop {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ============================================================================
  // MAIN CYCLE
  // ============================================================================

  /**
   * Run a full MAPE-K cycle
   */
  async runCycle(
    tenantId: string,
    trigger: "cron" | "event" | "manual",
    triggerEvent?: string,
  ): Promise<MAPEKCycleResult> {
    const startTime = Date.now();
    const cycleId = crypto.randomUUID();

    logger.info(
      `[MAPE-K] Starting cycle ${cycleId} for tenant ${tenantId} (trigger: ${trigger})`,
    );

    // Create cycle record
    await this.supabase.from("exo_mapek_cycles").insert({
      id: cycleId,
      tenant_id: tenantId,
      trigger_type: trigger,
      trigger_event: triggerEvent,
      status: "running",
    });

    let monitor: MonitorData;
    let analyze: AnalyzeResult;
    let plan: PlanResult;
    let execute: ExecuteResult;
    let knowledge: KnowledgeResult;
    let success = true;
    let error: string | undefined;

    try {
      // M - Monitor
      logger.info(`[MAPE-K] ${cycleId} - MONITOR phase`);
      monitor = await collectMonitorData(this.supabase, tenantId);

      // A - Analyze
      logger.info(`[MAPE-K] ${cycleId} - ANALYZE phase`);
      analyze = await analyzeMonitorData(this.supabase, tenantId, monitor);

      // P - Plan
      logger.info(`[MAPE-K] ${cycleId} - PLAN phase`);
      plan = await this.plan(tenantId, analyze);

      // E - Execute
      logger.info(`[MAPE-K] ${cycleId} - EXECUTE phase`);
      execute = await this.execute(tenantId, plan);

      // K - Knowledge
      logger.info(`[MAPE-K] ${cycleId} - KNOWLEDGE phase`);
      knowledge = await this.knowledge(tenantId, execute);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      logger.error(`[MAPE-K] Cycle ${cycleId} failed:`, err);

      // Set defaults for failed phases
      monitor = monitor! || getDefaultMonitorData();
      analyze = analyze! || getDefaultAnalyzeResult();
      plan = plan! || getDefaultPlanResult();
      execute = execute! || getDefaultExecuteResult();
      knowledge = knowledge! || getDefaultKnowledgeResult();
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Update cycle record
    await this.supabase
      .from("exo_mapek_cycles")
      .update({
        monitor_data: monitor,
        analyze_result: analyze,
        plan_result: plan,
        execute_result: execute,
        knowledge_result: knowledge,
        interventions_proposed: plan.interventions.length,
        interventions_executed: execute.interventionsExecuted,
        completed_at: completedAt,
        duration_ms: durationMs,
        status: success ? "completed" : "failed",
        error,
      })
      .eq("id", cycleId);

    logger.info(
      `[MAPE-K] Cycle ${cycleId} completed in ${durationMs}ms. ` +
        `Proposed: ${plan.interventions.length}, Executed: ${execute.interventionsExecuted}`,
    );

    // Log to system_optimizations for historical tracking (non-blocking)
    try {
      await this.supabase.from("system_optimizations").insert({
        tenant_id: tenantId,
        optimization_type: "mapek_cycle",
        description: `MAPE-K cycle: ${analyze.issues.length} issues, ${plan.interventions.length} proposed, ${execute.interventionsExecuted} executed`,
        before_state: {
          issues: analyze.issues.length,
          gaps: analyze.gaps.length,
          opportunities: analyze.opportunities.length,
        },
        after_state: {
          proposed: plan.interventions.length,
          executed: execute.interventionsExecuted,
          failed: execute.interventionsFailed,
          learnings: knowledge.learnings.length,
        },
        expected_impact: plan.interventions.length > 0 ? "positive" : "neutral",
        actual_impact: success ? "completed" : "failed",
      });
    } catch (err) {
      logger.warn(
        "[MAPE-K] Optimization logging failed:",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      cycleId,
      tenantId,
      trigger,
      triggerEvent,
      startedAt: new Date(startTime).toISOString(),
      completedAt,
      durationMs,
      monitor,
      analyze,
      plan,
      execute,
      knowledge,
      success,
      error,
    };
  }

  // ============================================================================
  // P - PLAN
  // ============================================================================

  /**
   * Plan: Create intervention proposals
   */
  async plan(
    tenantId: string,
    analyzeResult: AnalyzeResult,
  ): Promise<PlanResult> {
    const interventions: PlanResult["interventions"] = [];
    const skipped: PlanResult["skipped"] = [];

    // Check what permissions user has granted
    const permissionModel = getPermissionModel();
    const grants = await permissionModel.getUserGrants(tenantId);
    const hasAnyGrants = grants.length > 0;

    // 1. Plan interventions for issues
    for (const issue of analyzeResult.issues) {
      const intervention = planInterventionForIssue(issue, hasAnyGrants);
      if (intervention) {
        interventions.push(intervention);
      } else {
        skipped.push({
          action: `intervention_for_${issue.type}`,
          reason: "No appropriate intervention found",
        });
      }
    }

    // 2. Plan interventions for gaps — map each gap to a solving action
    for (const gap of analyzeResult.gaps) {
      const gapIntervention = planInterventionForGap(gap);
      interventions.push(gapIntervention);
    }

    // 3. Limit total interventions per cycle
    const maxInterventions = 3;
    if (interventions.length > maxInterventions) {
      interventions.sort((a, b) => {
        const priorityOrder: Record<InterventionPriority, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const removed = interventions.splice(maxInterventions);
      for (const r of removed) {
        skipped.push({
          action: r.title,
          reason: `Cycle limit of ${maxInterventions} interventions reached`,
        });
      }
    }

    return { interventions, skipped };
  }

  // ============================================================================
  // E - EXECUTE
  // ============================================================================

  /**
   * Execute: Create interventions and execute auto-approved ones
   */
  async execute(
    tenantId: string,
    planResult: PlanResult,
  ): Promise<ExecuteResult> {
    const errors: string[] = [];
    const results: ExecuteResult["results"] = [];
    let interventionsCreated = 0;
    let interventionsExecuted = 0;
    let interventionsFailed = 0;

    for (const planned of planResult.interventions) {
      try {
        // Dedup: skip if same tenant + type + title exists in last 24h
        const { count: recentCount } = await this.supabase
          .from("exo_interventions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("intervention_type", planned.type)
          .eq("title", planned.title)
          .gte(
            "created_at",
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          );

        if (recentCount && recentCount > 0) {
          logger.info(
            `[MAPE-K] Dedup: skipping "${planned.title}" — already proposed in last 24h`,
          );
          results.push({
            interventionId: "dedup-skipped",
            success: false,
            error: `Dedup: "${planned.title}" already proposed in last 24h`,
          });
          continue;
        }

        // Determine optimal delivery time
        let scheduledFor: string | null = null;
        if (planned.requiresApproval) {
          scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // auto-approve after 30min
        } else {
          try {
            const timing = await findOptimalDeliveryTime(tenantId, planned.priority);
            if (timing.delayed) {
              scheduledFor = timing.deliverAt.toISOString();
              logger.info("[MAPE-K] Intervention timing optimized:", {
                type: planned.type,
                reason: timing.reason,
                deliverAt: scheduledFor,
              });
            }
          } catch {
            // Non-critical — deliver immediately if timing fails
          }
        }

        // Create intervention record
        const { data: intervention, error: createError } =
          await this.supabase.rpc("propose_intervention", {
            p_tenant_id: tenantId,
            p_type: planned.type,
            p_title: planned.title,
            p_description: planned.description,
            p_action_payload: planned.actionPayload,
            p_priority: planned.priority,
            p_source_agent: "mape-k-loop",
            p_requires_approval: planned.requiresApproval,
            p_scheduled_for: scheduledFor,
          });

        if (createError) {
          errors.push(`Failed to create intervention: ${createError.message}`);
          interventionsFailed++;
          continue;
        }

        interventionsCreated++;
        const interventionId = intervention as string;

        // Guardian: Verify benefit before execution
        if (!planned.requiresApproval) {
          const guardian = getAlignmentGuardian();
          const verdict = await guardian.verifyBenefit(tenantId, {
            ...planned,
            id: interventionId,
          });

          // Update intervention with guardian data
          await this.supabase
            .from("exo_interventions")
            .update({
              benefit_score: verdict.benefitScore,
              benefit_reasoning: verdict.reasoning,
              guardian_verdict: verdict.action,
              guardian_checked_at: new Date().toISOString(),
              value_alignment_score: verdict.valueAlignmentScore,
            })
            .eq("id", interventionId);

          if (verdict.action === "blocked" || verdict.action === "deferred") {
            logger.info("[MAPE-K] Guardian blocked intervention:", {
              interventionId,
              type: planned.type,
              verdict: verdict.action,
              score: verdict.benefitScore,
              reason: verdict.reasoning,
            });

            await this.supabase
              .from("exo_interventions")
              .update({
                status: verdict.action === "blocked" ? "cancelled" : "proposed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", interventionId);

            results.push({
              interventionId,
              success: false,
              error: `Guardian ${verdict.action}: ${verdict.reasoning}`,
            });
            continue;
          }
        }

        // If auto-approved (and guardian approved), execute immediately
        if (!planned.requiresApproval) {
          const executor = getActionExecutor();
          const actionResult = await executor.execute({
            type: planned.actionPayload.action as any,
            tenantId,
            params: planned.actionPayload.params,
            interventionId,
          });

          // Update intervention status
          await this.supabase
            .from("exo_interventions")
            .update({
              status: actionResult.success ? "completed" : "failed",
              executed_at: new Date().toISOString(),
              execution_result: actionResult.data
                ? { data: actionResult.data }
                : null,
              execution_error: actionResult.error || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", interventionId);

          if (actionResult.success) {
            interventionsExecuted++;
          } else {
            interventionsFailed++;
            errors.push(
              `Intervention ${interventionId} failed: ${actionResult.error}`,
            );
          }

          results.push({
            interventionId,
            success: actionResult.success,
            result: actionResult.data,
            error: actionResult.error,
          });
        } else {
          results.push({
            interventionId,
            success: true,
            result: { status: "proposed" },
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Intervention execution error: ${errorMsg}`);
        interventionsFailed++;
      }
    }

    return {
      interventionsCreated,
      interventionsExecuted,
      interventionsFailed,
      errors,
      results,
    };
  }

  // ============================================================================
  // K - KNOWLEDGE
  // ============================================================================

  /**
   * Knowledge: Learn from execution and update patterns
   */
  async knowledge(
    tenantId: string,
    executeResult: ExecuteResult,
  ): Promise<KnowledgeResult> {
    const learnings: string[] = [];
    let patternsDetected = 0;
    let patternsUpdated = 0;
    let highlightsAdded = 0;
    let feedbackProcessed = 0;

    // 1. Process recent intervention feedback
    const { data: recentFeedback } = await this.supabase
      .from("exo_interventions")
      .select("id, intervention_type, user_feedback, action_payload")
      .eq("tenant_id", tenantId)
      .eq("learned_from", false)
      .not("user_feedback", "is", null)
      .limit(10);

    if (recentFeedback && recentFeedback.length > 0) {
      for (const feedback of recentFeedback) {
        feedbackProcessed++;

        if (feedback.user_feedback === "helpful") {
          learnings.push(
            `Intervention type "${feedback.intervention_type}" was helpful - consider similar actions`,
          );
        } else if (
          feedback.user_feedback === "harmful" ||
          feedback.user_feedback === "unhelpful"
        ) {
          learnings.push(
            `Intervention type "${feedback.intervention_type}" was not helpful - reduce frequency`,
          );
        }

        // Mark as learned
        await this.supabase
          .from("exo_interventions")
          .update({ learned_from: true, updated_at: new Date().toISOString() })
          .eq("id", feedback.id);
      }
    }

    // 2. Update intervention success patterns
    const { data: stats } = await this.supabase.rpc("get_intervention_stats", {
      p_tenant_id: tenantId,
      p_days: 7,
    });

    if (stats) {
      for (const stat of stats as any[]) {
        if (stat.total_proposed > 5 && stat.approval_rate < 0.3) {
          learnings.push(
            `Intervention type "${stat.intervention_type}" has low approval rate (${(stat.approval_rate * 100).toFixed(0)}%) - consider reducing`,
          );
        }
      }
    }

    // 3. Cross-domain correlation detection
    try {
      const { data: recentCycles } = await this.supabase
        .from("exo_mapek_cycles")
        .select("analyze_result")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      if (recentCycles && recentCycles.length >= 2) {
        const issueTypes = new Set<string>();
        for (const cycle of recentCycles) {
          const ar = cycle.analyze_result as AnalyzeResult | null;
          if (ar?.issues) {
            for (const issue of ar.issues) {
              issueTypes.add(issue.type);
            }
          }
        }

        // Sleep + productivity correlation
        if (
          issueTypes.has("sleep_debt") &&
          issueTypes.has("productivity_drop")
        ) {
          learnings.push(
            "Cross-domain pattern: sleep debt and productivity drop co-occurring — sleep improvement may boost productivity",
          );
          patternsDetected++;
        }

        // Social isolation + mood correlation
        if (
          issueTypes.has("social_isolation") &&
          (issueTypes.has("health_concern") ||
            issueTypes.has("productivity_drop"))
        ) {
          learnings.push(
            "Cross-domain pattern: social isolation correlates with health/productivity decline",
          );
          patternsDetected++;
        }

        // Goal + activity correlation
        if (issueTypes.has("missed_goal") && issueTypes.has("task_overload")) {
          learnings.push(
            "Cross-domain pattern: missed goals may be caused by task overload — suggest prioritization",
          );
          patternsDetected++;
        }
      }
    } catch (err) {
      logger.warn(
        "[MAPE-K] Pattern detection failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // 4. Analyze recent intervention outcomes (closed-loop feedback)
    try {
      const outcomeResult = await analyzeRecentOutcomes(tenantId);
      if (outcomeResult.processed > 0) {
        feedbackProcessed += outcomeResult.processed;
        learnings.push(
          `Outcome analysis: ${outcomeResult.outcomes.length} outcomes tracked from ${outcomeResult.processed} interventions`,
        );
      }
    } catch (err) {
      logger.warn(
        "[MAPE-K] Outcome analysis failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // 5. Run learning engine (updates tenant preferences)
    try {
      const learningResult = await learnFromOutcomes(tenantId);
      if (learningResult.preferences_updated > 0) {
        patternsUpdated += learningResult.preferences_updated;
        learnings.push(...learningResult.insights);
      }
    } catch (err) {
      logger.warn(
        "[MAPE-K] Learning engine failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // 5b. Guardian opportunity detection (positive suggestions, not just problems)
    try {
      const guardian = getAlignmentGuardian();
      // Get goal statuses from most recent monitor data if available
      const goalStatuses = await this.getRecentGoalStatuses(tenantId);
      const opportunities = await guardian.suggestOpportunities(tenantId, goalStatuses);

      if (opportunities.length > 0) {
        patternsDetected += opportunities.length;
        for (const opp of opportunities) {
          learnings.push(`[Opportunity] ${opp.title}: ${opp.suggestedAction}`);
        }

        // Send top opportunity as a proactive message (max 1 per cycle to avoid spam)
        const topOpp = opportunities[0];
        try {
          const { sendProactiveMessage } = await import("@/lib/cron/tenant-utils");
          await sendProactiveMessage(
            tenantId,
            `💡 ${topOpp.title}\n${topOpp.description}\n\n${topOpp.suggestedAction}`,
            "opportunity_detected",
            "guardian",
          );
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      logger.warn(
        "[MAPE-K] Opportunity detection failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // 6. Log learning event
    await this.supabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: patternsDetected > 0 ? "pattern_detected" : "agent_completed",
      data: {
        phase: "knowledge",
        feedbackProcessed,
        patternsDetected,
        patternsUpdated,
        learnings,
        interventionsCreated: executeResult.interventionsCreated,
        interventionsExecuted: executeResult.interventionsExecuted,
      },
      agent_id: "mape-k-loop",
    });

    return {
      patternsDetected,
      patternsUpdated,
      highlightsAdded,
      feedbackProcessed,
      learnings,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getRecentGoalStatuses(
    tenantId: string,
  ): Promise<
    Array<{
      goalId: string;
      name: string;
      category: string;
      trajectory: string;
      progressPercent: number;
      momentum: string;
    }>
  > {
    try {
      const { getGoalStatus } = await import("@/lib/goals/engine");
      const statuses = await getGoalStatus(tenantId);
      return statuses.map((s) => ({
        goalId: s.goal.id,
        name: s.goal.name,
        category: s.goal.category,
        trajectory: s.trajectory,
        progressPercent: s.progress_percent,
        momentum: s.momentum,
      }));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// GAP → ACTION MAPPING
// ============================================================================

/**
 * Map a detected gap to a solving action instead of a notification.
 */
function planInterventionForGap(
  gap: AnalyzeResult["gaps"][0],
): PlanResult["interventions"][0] {
  switch (gap.area) {
    case "health":
      return {
        type: "gap_detection",
        title: `Auto-generate sleep logger for ${gap.area} gap`,
        description: gap.description,
        actionPayload: {
          action: "build_app",
          params: {
            appType: "sleep_logger",
            reason: gap.description,
            suggestedFeatures: [
              "manual sleep log",
              "sleep quality rating",
              "weekly trend chart",
            ],
          },
        },
        priority: "medium",
        requiresApproval: true, // build_app is a bigger operation — route through CRON executor
        reasoning: `No health data — build a sleep logger tool instead of nagging`,
      };

    case "social":
      return {
        type: "gap_detection",
        title: `Social check-in: no interactions detected`,
        description: gap.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "social",
            message:
              "Hey, it's been quiet lately. How are things going? Anyone you've been meaning to reach out to?",
          },
        },
        priority: "low",
        requiresApproval: false,
        reasoning: `No social interactions — start a conversation instead of silent notification`,
      };

    case "integrations":
      return {
        type: "gap_detection",
        title: `Set up health tracker integration`,
        description: gap.description,
        actionPayload: {
          action: "create_task",
          params: {
            title: "Set up a health tracker integration",
            description: `${gap.suggestedAction || gap.description}. ExoSkull works best with connected data sources.`,
            priority: "medium",
            labels: ["auto:mape-k", "onboarding"],
          },
        },
        priority: "low",
        requiresApproval: false,
        reasoning: `No integrations connected — create actionable task instead of notification`,
      };

    default:
      // Fallback for unknown gap areas — still better than send_notification
      return {
        type: "gap_detection",
        title: `Blind spot detected: ${gap.area}`,
        description: gap.description,
        actionPayload: {
          action: "trigger_checkin",
          params: {
            checkinType: "general",
            message:
              gap.suggestedAction ||
              `ExoSkull noticed a gap in ${gap.area}. Want to talk about it?`,
          },
        },
        priority: "low",
        requiresApproval: false,
        reasoning: `Gap in ${gap.area} — trigger check-in instead of silent notification`,
      };
  }
}

// ============================================================================
// DEFAULT DATA HELPERS
// ============================================================================

function getDefaultMonitorData(): MonitorData {
  return {
    conversationsLast24h: 0,
    tasksCreated: 0,
    tasksDue: 0,
    tasksOverdue: 0,
    sleepHoursLast7d: [],
    activityMinutesLast7d: [],
    hrvTrend: "unknown",
    recentPatterns: [],
    activeAlerts: 0,
    lastInteractionAt: null,
    currentMood: null,
    energyLevel: null,
    upcomingEvents24h: 0,
    freeTimeBlocks: 0,
    connectedRigs: [],
    lastSyncTimes: {},
  };
}

function getDefaultAnalyzeResult(): AnalyzeResult {
  return {
    issues: [],
    opportunities: [],
    recommendations: [],
    gaps: [],
  };
}

function getDefaultPlanResult(): PlanResult {
  return {
    interventions: [],
    skipped: [],
  };
}

function getDefaultExecuteResult(): ExecuteResult {
  return {
    interventionsCreated: 0,
    interventionsExecuted: 0,
    interventionsFailed: 0,
    errors: [],
    results: [],
  };
}

function getDefaultKnowledgeResult(): KnowledgeResult {
  return {
    patternsDetected: 0,
    patternsUpdated: 0,
    highlightsAdded: 0,
    feedbackProcessed: 0,
    learnings: [],
  };
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let mapekLoopInstance: MAPEKLoop | null = null;

export function getMAPEKLoop(): MAPEKLoop {
  if (!mapekLoopInstance) {
    mapekLoopInstance = new MAPEKLoop();
  }
  return mapekLoopInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Run a MAPE-K cycle (convenience wrapper)
 */
export async function runAutonomyCycle(
  tenantId: string,
  trigger: "cron" | "event" | "manual" = "manual",
  triggerEvent?: string,
): Promise<MAPEKCycleResult> {
  const loop = getMAPEKLoop();
  return loop.runCycle(tenantId, trigger, triggerEvent);
}

/**
 * Run a MAPE-K cycle (direct export for orchestrator use).
 */
export const runMapeKCycle = runAutonomyCycle;
