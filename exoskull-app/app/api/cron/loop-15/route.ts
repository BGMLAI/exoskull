/**
 * Loop-15 CRON — 15-Minute Tenant Evaluator
 *
 * Per-tenant evaluation:
 * 1. Gets batch of tenants due for eval (max 5)
 * 2. Classifies activity class
 * 3. Quick DB state check (no AI)
 * 4. AI evaluation via Haiku (budget gated)
 * 5. Enqueues work items if action needed
 * 6. Processes one queued P2/P3 work item if time allows
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  getTenantsDueForEval,
  quickStateCheck,
  classifyActivity,
  updateTenantLoopState,
  claimQueuedWork,
  emitEvent,
} from "@/lib/iors/loop";
import { dispatchToHandler } from "@/lib/iors/loop-tasks";
import type { TenantLoopConfig, ActivityClass } from "@/lib/iors/loop-types";
import { ModelRouter } from "@/lib/ai/model-router";
import { CircuitBreaker } from "@/lib/iors/circuit-breaker";
import { logActivity } from "@/lib/activity-log";
import { collectCoachingSignals } from "@/lib/iors/coaching/signal-collector";
import {
  triageCoachingDecision,
  formatCoachingMessage,
} from "@/lib/iors/coaching/decision-engine";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000; // Leave 10s buffer under Vercel 60s

const EVAL_SYSTEM_PROMPT = `You are the IORS autonomous evaluator. You are an ACTIVE agent, not a passive monitor.
Your job: find things to DO for the user, then DO them.

Respond with ONLY a JSON object (no markdown):
{
  "action": "none" | "proactive" | "observation",
  "reason": "what you noticed and why you're acting",
  "message": "message to send to user (in their language, required if proactive)"
}

Evaluation priorities (check in order):
1. Overdue tasks → remind + offer to reschedule
2. Undelivered insights → send immediately
3. Pending interventions → notify about them
4. No recent contact (>6h during waking hours) → warm check-in
5. Goals behind schedule → suggest corrective actions
6. Patterns detected → share insights proactively

Rules:
- "proactive": send a message (ALWAYS include message field)
- "observation": run deeper analysis (MAPE-K cycle)
- "none": ONLY if genuinely nothing to do
- ALWAYS prefer ACTION over silence. If in doubt — communicate.
- User WANTS you to be proactive. They configured you to ACT.
- Keep messages natural, warm, concise — like a caring friend
- During sleep hours (23:00-07:00) → always "none"`;

/**
 * Get current hour in tenant's timezone.
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getHours();
  }
}

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const workerId = `loop15-${Date.now()}`;
  const router = new ModelRouter();

  let evaluated = 0;
  let workProcessed = 0;
  const evaluationResults: Array<{
    tenantId: string;
    class: string;
    action: string;
  }> = [];

  try {
    // Step 1: Get tenants due for evaluation (max 5)
    const tenants = await getTenantsDueForEval(5);

    // Step 2: Evaluate each tenant
    for (const tenant of tenants) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      try {
        // 2a. Classify activity
        const currentHour = getCurrentHourInTimezone(tenant.timezone);
        const activityClass = classifyActivity(tenant, currentHour);

        // 2b. Quick state check (DB only)
        const state = await quickStateCheck(tenant.tenant_id);

        // 2c. Skip if sleeping (23:00-07:00 in tenant's timezone)
        if (currentHour >= 23 || currentHour < 7) {
          await updateTenantLoopState(tenant.tenant_id, activityClass, 0);
          evaluationResults.push({
            tenantId: tenant.tenant_id,
            class: activityClass,
            action: "sleep",
          });
          evaluated++;
          continue;
        }

        // 2d. AI evaluation (always run during waking hours — budget + circuit breaker gate only)
        let action = "none";
        let aiCostCents = 0;

        const breaker = CircuitBreaker.for(tenant.tenant_id, "loop15_haiku");
        if (
          tenant.daily_ai_spent_cents < tenant.daily_ai_budget_cents &&
          breaker.isAllowed()
        ) {
          try {
            const response = await router.route({
              messages: [
                {
                  role: "user",
                  content: JSON.stringify({
                    pending_interventions: state.pendingInterventions,
                    overdue_tasks: state.overdueTasks,
                    undelivered_insights: state.undeliveredInsights,
                    hours_since_last_contact: Math.round(
                      state.hoursSinceLastContact,
                    ),
                    activity_class: activityClass,
                    current_hour: currentHour,
                    cycles_today: tenant.cycles_today || 0,
                  }),
                },
              ],
              taskCategory: "analysis", // Routes to Tier 2 (Haiku)
              tenantId: tenant.tenant_id,
              maxTokens: 200,
              temperature: 0.3,
            });

            aiCostCents = 1; // ~$0.01 per Haiku evaluation
            breaker.recordSuccess();

            // Parse AI response
            try {
              const parsed = JSON.parse(
                response.content
                  .replace(/```json?\n?/g, "")
                  .replace(/```/g, ""),
              );
              action = parsed.action || "none";

              // Enqueue action if needed
              if (action === "proactive" && parsed.message) {
                await emitEvent({
                  tenantId: tenant.tenant_id,
                  eventType: "proactive_trigger",
                  priority: 2,
                  source: "loop-15",
                  payload: {
                    message: parsed.message,
                    reason: parsed.reason,
                    handler: "deliver_proactive",
                  },
                  dedupKey: `loop15:proactive:${tenant.tenant_id}:${new Date().toISOString().slice(0, 13)}`,
                });
              } else if (action === "observation") {
                await emitEvent({
                  tenantId: tenant.tenant_id,
                  eventType: "data_ingested",
                  priority: 3,
                  source: "loop-15",
                  payload: {
                    reason: parsed.reason,
                    handler: "run_mape_k",
                  },
                  dedupKey: `loop15:observation:${tenant.tenant_id}:${new Date().toISOString().slice(0, 13)}`,
                });
              }
            } catch {
              // AI returned unparseable response — skip
              action = "none";
            }
          } catch (aiErr) {
            breaker.recordFailure(
              aiErr instanceof Error ? aiErr.message : String(aiErr),
            );
            logger.error("[Loop15] AI evaluation failed:", {
              tenantId: tenant.tenant_id,
              error: aiErr instanceof Error ? aiErr.message : aiErr,
              circuitState: breaker.getState().state,
            });
          }
        }

        // 2d. Coaching Engine — rule-based triage (free, no AI cost)
        let coachingAction = "none";
        try {
          if (
            action === "none" &&
            Date.now() - startTime < TIMEOUT_MS - 15_000
          ) {
            const signals = await collectCoachingSignals(tenant.tenant_id);
            const decision = triageCoachingDecision(signals);

            if (decision.type !== "none") {
              coachingAction = decision.type;
              const message = await formatCoachingMessage(
                decision,
                null, // tenant name could be fetched but adds latency
              );
              if (message) {
                await emitEvent({
                  tenantId: tenant.tenant_id,
                  eventType: "coaching_trigger",
                  priority: decision.priority,
                  source: "coaching-engine",
                  payload: {
                    message,
                    type: decision.type,
                    reason: decision.reason,
                    handler: "deliver_proactive",
                    data: decision.data,
                  },
                  dedupKey: `coaching:${decision.type}:${tenant.tenant_id}:${new Date().toISOString().slice(0, 13)}`,
                });
              }
            }
          }
        } catch (coachErr) {
          logger.error("[Loop15] Coaching engine failed:", {
            tenantId: tenant.tenant_id,
            error: coachErr instanceof Error ? coachErr.message : coachErr,
          });
        }

        // 2e. Update loop state
        await updateTenantLoopState(
          tenant.tenant_id,
          activityClass,
          aiCostCents,
        );

        evaluationResults.push({
          tenantId: tenant.tenant_id,
          class: activityClass,
          action:
            coachingAction !== "none" ? `coaching:${coachingAction}` : action,
        });
        evaluated++;

        if (action !== "none") {
          logActivity({
            tenantId: tenant.tenant_id,
            actionType: "loop_eval",
            actionName: `loop15_${action}`,
            description: `Ewaluacja: ${activityClass}, akcja: ${action}`,
            source: "loop-15",
            metadata: { activityClass, action },
          });
        }
      } catch (evalErr) {
        logger.error("[Loop15] Tenant evaluation failed:", {
          tenantId: tenant.tenant_id,
          error: evalErr instanceof Error ? evalErr.message : evalErr,
        });
      }
    }

    // Step 3: Process one queued P2/P3 work item if time allows
    if (Date.now() - startTime < TIMEOUT_MS - 10_000) {
      const workItem = await claimQueuedWork(workerId, [
        "proactive",
        "observation",
      ]);
      if (workItem) {
        await dispatchToHandler(workItem);
        workProcessed = 1;
      }
    }

    // Step 4: Ralph Loop — autonomous development cycle (1 per run)
    let ralphResult = null;
    if (Date.now() - startTime < TIMEOUT_MS - 15_000 && tenants.length > 0) {
      try {
        const { runRalphCycle } = await import("@/lib/iors/ralph-loop");
        const remainingMs = TIMEOUT_MS - (Date.now() - startTime);
        // Run for first tenant that had activity (not sleeping)
        const activeTenant = evaluationResults.find(
          (r) => r.action !== "sleep",
        );
        if (activeTenant) {
          ralphResult = await runRalphCycle(
            activeTenant.tenantId,
            Math.min(remainingMs - 5000, 20_000),
          );
        }
      } catch (ralphErr) {
        logger.error("[Loop15] Ralph cycle failed:", {
          error: ralphErr instanceof Error ? ralphErr.message : ralphErr,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      evaluated,
      workProcessed,
      ralph: ralphResult
        ? {
            outcome: ralphResult.outcome,
            action: ralphResult.action.type,
            description: ralphResult.action.description,
            durationMs: ralphResult.durationMs,
          }
        : null,
      evaluations: evaluationResults,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error("[Loop15] Error:", error);
    return NextResponse.json(
      {
        error: "Loop-15 processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "loop-15" }, handler);
