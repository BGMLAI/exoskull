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
  InterventionType,
  InterventionPriority,
  ProposeInterventionParams,
  Intervention,
} from "./types";
import { getActionExecutor } from "./action-executor";
import { getPermissionModel } from "./permission-model";
import { getAlignmentGuardian } from "./guardian";

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

    console.log(
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
      console.log(`[MAPE-K] ${cycleId} - MONITOR phase`);
      monitor = await this.monitor(tenantId);

      // A - Analyze
      console.log(`[MAPE-K] ${cycleId} - ANALYZE phase`);
      analyze = await this.analyze(tenantId, monitor);

      // P - Plan
      console.log(`[MAPE-K] ${cycleId} - PLAN phase`);
      plan = await this.plan(tenantId, analyze);

      // E - Execute
      console.log(`[MAPE-K] ${cycleId} - EXECUTE phase`);
      execute = await this.execute(tenantId, plan);

      // K - Knowledge
      console.log(`[MAPE-K] ${cycleId} - KNOWLEDGE phase`);
      knowledge = await this.knowledge(tenantId, execute);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      console.error(`[MAPE-K] Cycle ${cycleId} failed:`, err);

      // Set defaults for failed phases
      monitor = monitor! || this.getDefaultMonitorData();
      analyze = analyze! || this.getDefaultAnalyzeResult();
      plan = plan! || this.getDefaultPlanResult();
      execute = execute! || this.getDefaultExecuteResult();
      knowledge = knowledge! || this.getDefaultKnowledgeResult();
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

    console.log(
      `[MAPE-K] Cycle ${cycleId} completed in ${durationMs}ms. ` +
        `Proposed: ${plan.interventions.length}, Executed: ${execute.interventionsExecuted}`,
    );

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
  // M - MONITOR
  // ============================================================================

  /**
   * Monitor: Collect data from all sources
   */
  async monitor(tenantId: string): Promise<MonitorData> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const [
      conversationsResult,
      tasksCreatedResult,
      tasksDueResult,
      tasksOverdueResult,
      sleepResult,
      activityResult,
      lastInteractionResult,
      rigsResult,
      alertsResult,
      patternsResult,
    ] = await Promise.all([
      // Conversations last 24h
      this.supabase
        .from("exo_conversations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", dayAgo.toISOString()),

      // Tasks created last 24h
      this.supabase
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", dayAgo.toISOString()),

      // Tasks due today
      this.supabase
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .lte("due_date", now.toISOString())
        .gte("due_date", new Date(now.setHours(0, 0, 0, 0)).toISOString()),

      // Overdue tasks
      this.supabase
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .lt("due_date", new Date(now.setHours(0, 0, 0, 0)).toISOString()),

      // Sleep data last 7 days
      this.supabase
        .from("exo_sleep_entries")
        .select("duration_minutes, sleep_date")
        .eq("tenant_id", tenantId)
        .gte("sleep_date", weekAgo.toISOString().split("T")[0])
        .order("sleep_date", { ascending: true }),

      // Activity data last 7 days
      this.supabase
        .from("exo_activity_entries")
        .select("duration_minutes, entry_date")
        .eq("tenant_id", tenantId)
        .gte("entry_date", weekAgo.toISOString().split("T")[0])
        .order("entry_date", { ascending: true }),

      // Last interaction
      this.supabase
        .from("exo_conversations")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),

      // Connected rigs
      this.supabase
        .from("rig_connections")
        .select("rig_slug, last_sync_at")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),

      // Active alerts (pending interventions)
      this.supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "proposed"),

      // Recent patterns
      this.supabase
        .from("user_patterns")
        .select("description")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("confidence", { ascending: false })
        .limit(5),
    ]);

    // Process sleep data into hours array
    const sleepHoursLast7d: number[] = [];
    if (sleepResult.data) {
      for (const entry of sleepResult.data) {
        sleepHoursLast7d.push((entry.duration_minutes || 0) / 60);
      }
    }

    // Process activity data
    const activityMinutesLast7d: number[] = [];
    if (activityResult.data) {
      for (const entry of activityResult.data) {
        activityMinutesLast7d.push(entry.duration_minutes || 0);
      }
    }

    // Determine HRV trend (simplified)
    const hrvTrend = this.calculateHrvTrend(sleepHoursLast7d);

    // Build last sync times
    const lastSyncTimes: Record<string, string> = {};
    if (rigsResult.data) {
      for (const rig of rigsResult.data) {
        if (rig.last_sync_at) {
          lastSyncTimes[rig.rig_slug] = rig.last_sync_at;
        }
      }
    }

    return {
      conversationsLast24h: conversationsResult.count || 0,
      tasksCreated: tasksCreatedResult.count || 0,
      tasksDue: tasksDueResult.count || 0,
      tasksOverdue: tasksOverdueResult.count || 0,
      sleepHoursLast7d,
      activityMinutesLast7d,
      hrvTrend,
      recentPatterns: patternsResult.data?.map((p) => p.description) || [],
      activeAlerts: alertsResult.count || 0,
      lastInteractionAt: lastInteractionResult.data?.created_at || null,
      currentMood: null, // TODO: Get from mood tracker
      energyLevel: null, // TODO: Get from energy tracker
      upcomingEvents24h: 0, // TODO: Get from calendar
      freeTimeBlocks: 0, // TODO: Calculate from calendar
      connectedRigs: rigsResult.data?.map((r) => r.rig_slug) || [],
      lastSyncTimes,
    };
  }

  // ============================================================================
  // A - ANALYZE
  // ============================================================================

  /**
   * Analyze: Detect issues, opportunities, and gaps
   */
  async analyze(
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

    return {
      issues,
      opportunities,
      recommendations,
      gaps,
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
      const intervention = this.planInterventionForIssue(issue, hasAnyGrants);
      if (intervention) {
        interventions.push(intervention);
      } else {
        skipped.push({
          action: `intervention_for_${issue.type}`,
          reason: "No appropriate intervention found",
        });
      }
    }

    // 2. Plan interventions for gaps
    for (const gap of analyzeResult.gaps) {
      interventions.push({
        type: "gap_detection",
        title: `Blind spot detected: ${gap.area}`,
        description: gap.description,
        actionPayload: {
          action: "send_notification",
          params: {
            title: `ExoSkull noticed a gap in ${gap.area}`,
            body: gap.suggestedAction || gap.description,
          },
        },
        priority: "low",
        requiresApproval: true,
        reasoning: `No activity in ${gap.area} area detected - user might benefit from awareness`,
      });
    }

    // 3. Limit total interventions per cycle
    const maxInterventions = 3;
    if (interventions.length > maxInterventions) {
      // Sort by priority and take top N
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
            p_scheduled_for: null,
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
            console.log("[MAPE-K] Guardian blocked intervention:", {
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

        // Learn from feedback
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

    // 3. Log learning event
    await this.supabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: "agent_completed",
      data: {
        phase: "knowledge",
        feedbackProcessed,
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

  private planInterventionForIssue(
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
          requiresApproval: true,
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
          requiresApproval: true,
          reasoning: "Low activity may benefit from gentle nudge",
        };

      default:
        return null;
    }
  }

  private calculateHrvTrend(
    sleepHours: number[],
  ): "improving" | "stable" | "declining" | "unknown" {
    if (sleepHours.length < 3) return "unknown";

    // Simple trend: compare first half average to second half
    const mid = Math.floor(sleepHours.length / 2);
    const firstHalf = sleepHours.slice(0, mid);
    const secondHalf = sleepHours.slice(mid);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    if (diff > 0.5) return "improving";
    if (diff < -0.5) return "declining";
    return "stable";
  }

  private getDefaultMonitorData(): MonitorData {
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

  private getDefaultAnalyzeResult(): AnalyzeResult {
    return {
      issues: [],
      opportunities: [],
      recommendations: [],
      gaps: [],
    };
  }

  private getDefaultPlanResult(): PlanResult {
    return {
      interventions: [],
      skipped: [],
    };
  }

  private getDefaultExecuteResult(): ExecuteResult {
    return {
      interventionsCreated: 0,
      interventionsExecuted: 0,
      interventionsFailed: 0,
      errors: [],
      results: [],
    };
  }

  private getDefaultKnowledgeResult(): KnowledgeResult {
    return {
      patternsDetected: 0,
      patternsUpdated: 0,
      highlightsAdded: 0,
      feedbackProcessed: 0,
      learnings: [],
    };
  }
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
 * Run a MAPE-K cycle
 */
export async function runAutonomyCycle(
  tenantId: string,
  trigger: "cron" | "event" | "manual" = "manual",
  triggerEvent?: string,
): Promise<MAPEKCycleResult> {
  const loop = getMAPEKLoop();
  return loop.runCycle(tenantId, trigger, triggerEvent);
}
