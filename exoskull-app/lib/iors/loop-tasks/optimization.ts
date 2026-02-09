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

import { logger } from "@/lib/logger";
export async function handleOptimization(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    logger.info("[Petla:Optimization] Processing:", {
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

        logger.info("[Petla:Optimization] Weekly stats:", {
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

        // ============================================================
        // AUTO-TUNING: Close the feedback loop
        // Philosophy: low satisfaction ≠ do less. It means the
        // current APPROACH isn't working — find a different one.
        // ============================================================

        // 1. Low satisfaction → analyze what's failing & change approach
        if (rated.length >= 5 && avgFeedbackRating < 2.5) {
          logger.warn(
            "[Petla:Optimization] Low satisfaction — diagnosing failing approach",
            { tenantId: tenant_id, avgRating: avgFeedbackRating },
          );

          // Find which intervention types are disliked vs liked
          const { data: recentInterventions } = await supabase
            .from("exo_interventions")
            .select("intervention_type, user_feedback, status")
            .eq("tenant_id", tenant_id)
            .gte("created_at", weekAgo);

          const typeStats = new Map<
            string,
            { good: number; bad: number; total: number }
          >();
          for (const intv of recentInterventions || []) {
            const t = intv.intervention_type || "unknown";
            const s = typeStats.get(t) || { good: 0, bad: 0, total: 0 };
            s.total++;
            if (intv.user_feedback === "helpful") s.good++;
            if (
              intv.user_feedback === "unhelpful" ||
              intv.user_feedback === "harmful" ||
              intv.status === "cancelled"
            )
              s.bad++;
            typeStats.set(t, s);
          }

          // Identify failing types (>50% negative) and succeeding types
          const failingTypes: string[] = [];
          const succeedingTypes: string[] = [];
          for (const [type, s] of typeStats) {
            if (s.total >= 2 && s.bad / s.total > 0.5) failingTypes.push(type);
            if (s.total >= 2 && s.good / s.total > 0.5)
              succeedingTypes.push(type);
          }

          // Shift personality style — try a different communication approach
          const { data: tenant } = await supabase
            .from("exo_tenants")
            .select("iors_personality")
            .eq("id", tenant_id)
            .maybeSingle();

          const personality = (tenant?.iors_personality || {}) as Record<
            string,
            unknown
          >;
          const style = (personality.style || {}) as Record<string, number>;

          // Rotate approach: if current is formal → try empathetic, if direct → try detailed
          const adjustments: Record<string, number> = {};
          if ((style.formality ?? 50) > 60) {
            adjustments.formality = Math.max(20, (style.formality ?? 50) - 20);
            adjustments.empathy = Math.min(90, (style.empathy ?? 50) + 15);
          } else {
            adjustments.directness = Math.min(
              80,
              (style.directness ?? 50) + 15,
            );
            adjustments.detail_level = Math.max(
              20,
              (style.detail_level ?? 50) - 15,
            );
          }

          const newStyle = { ...style, ...adjustments };

          await supabase
            .from("exo_tenants")
            .update({
              iors_personality: {
                ...personality,
                style: newStyle,
              },
            })
            .eq("id", tenant_id);

          await supabase.from("system_optimizations").insert({
            tenant_id,
            type: "approach_pivot",
            description: `Low satisfaction (${avgFeedbackRating.toFixed(1)}/5) — pivoting communication style. Failing types: [${failingTypes.join(", ")}]. Succeeding: [${succeedingTypes.join(", ")}]. Style adjustments: ${JSON.stringify(adjustments)}`,
            data: {
              before: { style, avgRating: avgFeedbackRating },
              after: { style: newStyle },
              failingTypes,
              succeedingTypes,
              typeStats: Object.fromEntries(typeStats),
            },
          });
        }

        // 2. Low success rate → escalate model tier for better reasoning
        if (total >= 10 && successRate < 0.4) {
          logger.warn(
            "[Petla:Optimization] Low success rate — escalating approach",
            { tenantId: tenant_id, successRate },
          );

          await supabase.from("system_optimizations").insert({
            tenant_id,
            type: "approach_escalation",
            description: `Success rate ${Math.round(successRate * 100)}% (${success}/${total}) — system should try different intervention types and higher-tier models for planning.`,
            data: {
              success,
              fails,
              total,
              successRate: Math.round(successRate * 100),
            },
          });
        }

        // 3. High satisfaction → reinforce what's working
        if (rated.length >= 5 && avgFeedbackRating >= 4.0) {
          const { data: tenant } = await supabase
            .from("exo_tenants")
            .select("iors_personality")
            .eq("id", tenant_id)
            .maybeSingle();

          const personality = (tenant?.iors_personality || {}) as Record<
            string,
            unknown
          >;
          const currentProactivity =
            typeof personality.proactivity === "number"
              ? personality.proactivity
              : 50;

          if (currentProactivity < 90) {
            const newProactivity = Math.min(90, currentProactivity + 10);

            await supabase
              .from("exo_tenants")
              .update({
                iors_personality: {
                  ...personality,
                  proactivity: newProactivity,
                },
              })
              .eq("id", tenant_id);

            await supabase.from("system_optimizations").insert({
              tenant_id,
              type: "proactivity_boost",
              description: `High satisfaction (${avgFeedbackRating.toFixed(1)}/5) — current approach works, boosting proactivity ${currentProactivity} → ${newProactivity}`,
              data: {
                before: { proactivity: currentProactivity },
                after: { proactivity: newProactivity },
                trigger: {
                  avgRating: avgFeedbackRating,
                  ratedCount: rated.length,
                },
              },
            });

            logger.info(
              "[Petla:Optimization] High satisfaction — reinforcing approach",
              {
                tenantId: tenant_id,
                from: currentProactivity,
                to: newProactivity,
              },
            );
          }
        }

        break;
      }

      case "guardian_effectiveness": {
        // Bridge to existing guardian effectiveness CRON logic
        // This runs weekly — analyzes guardian verdict patterns
        logger.info("[Petla:Optimization] Guardian effectiveness check:", {
          tenantId: tenant_id,
        });
        break;
      }

      default:
        logger.info("[Petla:Optimization] Unknown handler:", item.handler);
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
