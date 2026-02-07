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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000; // Leave 10s buffer under Vercel 60s

const EVAL_SYSTEM_PROMPT = `You are the IORS loop evaluator. Based on the tenant's current state, decide if any proactive action is needed.

Respond with ONLY a JSON object (no markdown):
{
  "action": "none" | "proactive" | "observation",
  "reason": "brief explanation",
  "message": "optional message to send to user (in their language)"
}

Rules:
- "none": nothing to do, user is fine
- "proactive": send a message (insight, reminder, suggestion)
- "observation": run deeper analysis (MAPE-K cycle)
- Keep messages natural, warm, and concise
- Respect that user may be busy — don't over-communicate`;

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

        // 2c. AI evaluation (only if budget allows AND state check found something)
        let action = "none";
        let aiCostCents = 0;

        if (
          state.needsEval &&
          tenant.daily_ai_spent_cents < tenant.daily_ai_budget_cents
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
            console.error("[Loop15] AI evaluation failed:", {
              tenantId: tenant.tenant_id,
              error: aiErr instanceof Error ? aiErr.message : aiErr,
            });
          }
        }

        // 2d. Update loop state
        await updateTenantLoopState(
          tenant.tenant_id,
          activityClass,
          aiCostCents,
        );

        evaluationResults.push({
          tenantId: tenant.tenant_id,
          class: activityClass,
          action,
        });
        evaluated++;
      } catch (evalErr) {
        console.error("[Loop15] Tenant evaluation failed:", {
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

    return NextResponse.json({
      ok: true,
      evaluated,
      workProcessed,
      evaluations: evaluationResults,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[Loop15] Error:", error);
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
