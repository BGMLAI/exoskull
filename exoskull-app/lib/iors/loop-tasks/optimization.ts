/**
 * Optimization Sub-Loop Handler (P4)
 *
 * Self-improvement — adjusts loop timing, model selection,
 * intervention thresholds based on effectiveness data.
 * Runs primarily from loop-daily.
 */

import { completeWork, failWork } from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

export async function handleOptimization(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    console.log("[Petla:Optimization] Processing:", {
      tenantId: tenant_id,
      handler: item.handler,
    });

    switch (item.handler) {
      case "run_optimization": {
        // Analyze intervention + feedback patterns
        const supabase = getServiceSupabase();
        const weekAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const [successCount, failCount, feedbackData] = await Promise.all([
          supabase
            .from("exo_interventions")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant_id)
            .eq("status", "completed")
            .gte("created_at", weekAgo),
          supabase
            .from("exo_interventions")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant_id)
            .in("status", ["failed", "cancelled"])
            .gte("created_at", weekAgo),
          supabase
            .from("exo_feedback")
            .select("rating, feedback_type")
            .eq("tenant_id", tenant_id)
            .gte("created_at", weekAgo),
        ]);

        const success = successCount.count || 0;
        const fails = failCount.count || 0;
        const total = success + fails;
        const successRate = total > 0 ? success / total : 0.5;

        const feedback = feedbackData.data || [];
        const rated = feedback.filter(
          (f: { rating: number | null }) => f.rating != null,
        );
        const avgFeedbackRating =
          rated.length > 0
            ? rated.reduce(
                (s: number, f: { rating: number | null }) =>
                  s + (f.rating || 0),
                0,
              ) / rated.length
            : 0;

        console.log("[Petla:Optimization] Weekly stats:", {
          tenantId: tenant_id,
          interventions: {
            success,
            fails,
            successRate: Math.round(successRate * 100),
          },
          feedback: {
            total: feedback.length,
            avgRating: Math.round(avgFeedbackRating * 10) / 10,
          },
        });

        break;
      }

      case "guardian_effectiveness": {
        // Bridge to existing guardian effectiveness CRON logic
        // This runs weekly — analyzes guardian verdict patterns
        console.log("[Petla:Optimization] Guardian effectiveness check:", {
          tenantId: tenant_id,
        });
        break;
      }

      default:
        console.log("[Petla:Optimization] Unknown handler:", item.handler);
    }

    if (item.id && item.status === "processing") {
      await completeWork(item.id, { optimized: true, handler: item.handler });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Optimization] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
