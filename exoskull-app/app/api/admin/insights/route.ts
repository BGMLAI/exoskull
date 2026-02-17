import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// DB row shapes for query results
interface AiUsageRow {
  tier: number;
  estimated_cost: number;
  success: boolean;
}
interface EngagementRow {
  engagement_level: string;
  churn_risk: number;
}
interface InterventionRow {
  guardian_verdict: string;
  user_feedback: string;
  benefit_score: number;
}
interface LearningEventRow {
  event_type: string;
}
interface ModRegistryRow {
  id: string;
  name: string;
  is_builtin: boolean;
}

/**
 * System self-optimization insights.
 * Analyzes patterns across all metrics to generate actionable recommendations.
 * Mirrors the MAPE-K loop at system level (not per-user).
 */
export const GET = withApiLog(async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    const insights: {
      id: string;
      type: "optimization" | "warning" | "anomaly" | "suggestion" | "revenue";
      severity: "info" | "warning" | "critical";
      title: string;
      description: string;
      metric?: string;
      currentValue?: number;
      threshold?: number;
      action?: string;
    }[] = [];

    // 1. Analyze cron health
    const { data: cronHealth } = await db.rpc("get_cron_health_summary", {
      p_hours: 48,
    });
    for (const cron of cronHealth || []) {
      if (cron.failed_runs > 0 && cron.total_runs > 0) {
        const failRate = cron.failed_runs / cron.total_runs;
        if (failRate > 0.3) {
          insights.push({
            id: `cron-fail-${cron.cron_name}`,
            type: "warning",
            severity: failRate > 0.5 ? "critical" : "warning",
            title: `Cron "${cron.cron_name}" failure rate: ${(failRate * 100).toFixed(0)}%`,
            description: `${cron.failed_runs}/${cron.total_runs} runs failed in the last 48h.`,
            metric: "cron_failure_rate",
            currentValue: failRate,
            threshold: 0.3,
            action: `Check /admin/logs for errors from cron:${cron.cron_name}`,
          });
        }
      }
      if (cron.avg_duration_ms && cron.avg_duration_ms > 30000) {
        insights.push({
          id: `cron-slow-${cron.cron_name}`,
          type: "optimization",
          severity: cron.avg_duration_ms > 50000 ? "warning" : "info",
          title: `Cron "${cron.cron_name}" is slow: ${Math.round(cron.avg_duration_ms)}ms avg`,
          description: `Average duration exceeds 30s. Risk of Vercel timeout (60s).`,
          metric: "cron_duration_ms",
          currentValue: cron.avg_duration_ms,
          threshold: 30000,
          action:
            "Consider breaking into smaller batches or optimizing queries.",
        });
      }
    }

    // 2. Analyze AI costs
    const { data: aiUsage7d } = await db
      .from("exo_ai_usage")
      .select("tier, estimated_cost, success")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

    if (aiUsage7d && aiUsage7d.length > 0) {
      const totalCost7d = aiUsage7d.reduce(
        (s, r: AiUsageRow) => s + (r.estimated_cost || 0),
        0,
      );
      const tier4Usage = aiUsage7d.filter((r: AiUsageRow) => r.tier === 4);
      const tier4Pct = tier4Usage.length / aiUsage7d.length;

      if (tier4Pct > 0.3) {
        insights.push({
          id: "ai-tier4-overuse",
          type: "optimization",
          severity: "warning",
          title: `Opus (T4) used for ${(tier4Pct * 100).toFixed(0)}% of requests`,
          description: `High-tier model overuse increases costs. Review routing rules.`,
          metric: "tier4_usage_pct",
          currentValue: tier4Pct,
          threshold: 0.3,
          action:
            "Check AI routing classification. Many tasks may be routable to Haiku or Flash.",
        });
      }

      const errorRate =
        aiUsage7d.filter((r: AiUsageRow) => !r.success).length /
        aiUsage7d.length;
      if (errorRate > 0.05) {
        insights.push({
          id: "ai-high-error-rate",
          type: "warning",
          severity: errorRate > 0.15 ? "critical" : "warning",
          title: `AI error rate: ${(errorRate * 100).toFixed(1)}% (7d)`,
          description: `${aiUsage7d.filter((r: AiUsageRow) => !r.success).length} failures out of ${aiUsage7d.length} requests.`,
          metric: "ai_error_rate",
          currentValue: errorRate,
          threshold: 0.05,
          action: "Check circuit breaker states and model provider status.",
        });
      }
    }

    // 3. Analyze engagement trends
    const { data: engScores } = await db
      .from("exo_engagement_scores")
      .select("engagement_level, churn_risk");

    if (engScores && engScores.length > 0) {
      const dormantPct =
        engScores.filter((e: EngagementRow) => e.engagement_level === "dormant")
          .length / engScores.length;
      if (dormantPct > 0.4) {
        insights.push({
          id: "engagement-dormant-high",
          type: "warning",
          severity: "warning",
          title: `${(dormantPct * 100).toFixed(0)}% of users are dormant`,
          description:
            "High dormancy rate. Consider activation campaigns or drip improvements.",
          metric: "dormant_user_pct",
          currentValue: dormantPct,
          threshold: 0.4,
          action:
            "Review drip-engine schedule and content. Consider targeted re-engagement.",
        });
      }

      const highChurn = engScores.filter(
        (e: EngagementRow) => e.churn_risk > 0.7,
      );
      if (highChurn.length > 0) {
        insights.push({
          id: "churn-risk-users",
          type: "warning",
          severity: highChurn.length > 5 ? "critical" : "warning",
          title: `${highChurn.length} users at high churn risk (>70%)`,
          description:
            "Users likely to leave. Proactive intervention recommended.",
          metric: "high_churn_users",
          currentValue: highChurn.length,
          action: "View at-risk users in /admin/users and prioritize outreach.",
        });
      }
    }

    // 4. Analyze intervention effectiveness
    const { data: interventions } = await db
      .from("exo_interventions")
      .select("guardian_verdict, user_feedback, benefit_score")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    if (interventions && interventions.length > 10) {
      const blocked = interventions.filter(
        (i: InterventionRow) => i.guardian_verdict === "blocked",
      );
      const blockRate = blocked.length / interventions.length;

      if (blockRate > 0.5) {
        insights.push({
          id: "guardian-high-block-rate",
          type: "anomaly",
          severity: "warning",
          title: `Guardian blocks ${(blockRate * 100).toFixed(0)}% of interventions`,
          description:
            "High block rate may indicate overly restrictive guardian config or poor intervention proposals.",
          metric: "guardian_block_rate",
          currentValue: blockRate,
          threshold: 0.5,
          action:
            "Review guardian config thresholds and intervention proposal quality.",
        });
      }

      const negFeedback = interventions.filter(
        (i: InterventionRow) =>
          i.user_feedback === "not_helpful" || i.user_feedback === "harmful",
      );
      if (negFeedback.length > 3) {
        insights.push({
          id: "intervention-neg-feedback",
          type: "warning",
          severity: "warning",
          title: `${negFeedback.length} interventions received negative feedback (30d)`,
          description: "Users reporting interventions as unhelpful or harmful.",
          metric: "negative_feedback_count",
          currentValue: negFeedback.length,
          action: "Review intervention types and content in /admin/autonomy.",
        });
      }
    }

    // 5. Data pipeline freshness
    const { data: lastGoldSync } = await db
      .from("exo_gold_sync_log")
      .select("started_at, status")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (lastGoldSync) {
      const hoursSinceSync =
        (Date.now() - new Date(lastGoldSync.started_at).getTime()) / 3600000;
      if (hoursSinceSync > 48) {
        insights.push({
          id: "pipeline-stale",
          type: "warning",
          severity: "critical",
          title: `Gold data is ${Math.round(hoursSinceSync)}h old`,
          description:
            "Data pipeline may be failing. Dashboard metrics are stale.",
          metric: "data_freshness_hours",
          currentValue: hoursSinceSync,
          threshold: 48,
          action: "Check bronze/silver/gold ETL cron jobs in /admin/cron.",
        });
      }
    }

    // 6. Learning events analysis
    const { data: learningEvents } = await db
      .from("learning_events")
      .select("event_type")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

    if (learningEvents && learningEvents.length > 0) {
      const patternDetections = learningEvents.filter(
        (e: LearningEventRow) => e.event_type === "pattern_detected",
      ).length;
      insights.push({
        id: "learning-patterns",
        type: "suggestion",
        severity: "info",
        title: `${patternDetections} patterns detected this week`,
        description: `System learning is ${patternDetections > 5 ? "active" : "low"}. ${learningEvents.length} total learning events.`,
        metric: "patterns_detected_7d",
        currentValue: patternDetections,
      });
    }

    // 7. Revenue & monetization analysis
    const { data: bizMetrics } = await db
      .from("exo_business_daily_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(30);

    if (bizMetrics && bizMetrics.length >= 2) {
      const latest = bizMetrics[0];
      const weekAgo = bizMetrics[Math.min(6, bizMetrics.length - 1)];

      // MRR trend
      if (weekAgo && latest.mrr_pln < weekAgo.mrr_pln) {
        const mrrDrop = weekAgo.mrr_pln - latest.mrr_pln;
        insights.push({
          id: "revenue-mrr-declining",
          type: "revenue",
          severity: mrrDrop > weekAgo.mrr_pln * 0.1 ? "critical" : "warning",
          title: `MRR declining: ${latest.mrr_pln} PLN (was ${weekAgo.mrr_pln} PLN)`,
          description: `MRR dropped ${mrrDrop.toFixed(0)} PLN in the last 7 days.`,
          metric: "mrr_pln",
          currentValue: latest.mrr_pln,
          action:
            "Analyze churn causes. Check if specific tier or cohort is leaving.",
        });
      }

      // Low trial conversion
      if (latest.trial_to_paid_rate < 0.1 && latest.trial_users > 3) {
        insights.push({
          id: "revenue-low-conversion",
          type: "revenue",
          severity: "warning",
          title: `Trial conversion: ${(latest.trial_to_paid_rate * 100).toFixed(1)}% (${latest.trial_users} in trial)`,
          description:
            "Low trial-to-paid conversion. Users may not see enough value in the trial period.",
          metric: "trial_to_paid_rate",
          currentValue: latest.trial_to_paid_rate,
          threshold: 0.1,
          action:
            "Consider extending trial, improving onboarding, or adding trial-specific features that showcase premium value.",
        });
      }

      // High churn rate
      if (latest.churn_rate_30d > 0.08) {
        insights.push({
          id: "revenue-high-churn",
          type: "revenue",
          severity: latest.churn_rate_30d > 0.15 ? "critical" : "warning",
          title: `Monthly churn: ${(latest.churn_rate_30d * 100).toFixed(1)}% (${latest.churned_users_30d} users)`,
          description:
            "Churn exceeds healthy threshold (<8%). Revenue at risk.",
          metric: "churn_rate_30d",
          currentValue: latest.churn_rate_30d,
          threshold: 0.08,
          action:
            "1) Interview churned users. 2) Add retention triggers (before-churn drip). 3) Review value delivery in first 30 days.",
        });
      }

      // ARPU optimization
      if (latest.arpu_pln > 0 && latest.arpu_pln < 50) {
        insights.push({
          id: "revenue-low-arpu",
          type: "revenue",
          severity: "info",
          title: `ARPU: ${latest.arpu_pln.toFixed(0)} PLN - room for upsell`,
          description:
            "Average revenue per user is low. Consider upsell paths.",
          metric: "arpu_pln",
          currentValue: latest.arpu_pln,
          action:
            "1) Introduce premium mods/features. 2) Add usage-based pricing. 3) Create Pro tier benefits that justify higher price.",
        });
      }
    }

    // 8. Popular mods analysis - suggest enabling popular mods by default
    const { data: installations } = await db
      .from("exo_user_installations")
      .select("registry_item_id, is_active")
      .eq("is_active", true);

    if (installations && installations.length > 0) {
      const modCounts = new Map<string, number>();
      for (const inst of installations) {
        const id = inst.registry_item_id;
        modCounts.set(id, (modCounts.get(id) || 0) + 1);
      }

      // Get mod names for top mods
      const topModIds = Array.from(modCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topModIds.length > 0) {
        const { data: modNames } = await db
          .from("exo_registry")
          .select("id, name, is_builtin")
          .in(
            "id",
            topModIds.map(([id]) => id),
          );

        const modNameMap = new Map(
          (modNames || []).map((m: ModRegistryRow) => [m.id, m]),
        );
        const topModsList = topModIds
          .map(
            ([id, count]) =>
              `${modNameMap.get(id)?.name || id} (${count} users)`,
          )
          .join(", ");

        insights.push({
          id: "mods-popular",
          type: "suggestion",
          severity: "info",
          title: `Most popular mods: ${topModsList}`,
          description:
            "Consider making these pre-installed for new users to improve activation.",
          action:
            "Enable auto-install for top mods during onboarding. This reduces friction and shows value faster.",
        });

        // Check for non-builtin popular mods
        const popularNonBuiltin = topModIds.filter(
          ([id]) => modNameMap.get(id) && !modNameMap.get(id)?.is_builtin,
        );
        if (popularNonBuiltin.length > 0) {
          insights.push({
            id: "mods-promote-to-builtin",
            type: "suggestion",
            severity: "info",
            title: `${popularNonBuiltin.length} popular mods are not built-in`,
            description:
              "Community mods with high adoption could become built-in to improve reliability.",
            action:
              "Review these mods for quality and consider promoting to built-in status.",
          });
        }
      }
    }

    // 9. User feedback patterns from interventions
    if (interventions && interventions.length > 0) {
      const feedbackCounts = new Map<string, number>();
      for (const i of interventions) {
        if (i.user_feedback) {
          feedbackCounts.set(
            i.user_feedback,
            (feedbackCounts.get(i.user_feedback) || 0) + 1,
          );
        }
      }

      const helpfulCount = feedbackCounts.get("helpful") || 0;
      const totalFeedback = Array.from(feedbackCounts.values()).reduce(
        (s, v) => s + v,
        0,
      );
      if (totalFeedback > 5) {
        const helpfulRate = helpfulCount / totalFeedback;
        if (helpfulRate < 0.5) {
          insights.push({
            id: "feedback-low-helpful-rate",
            type: "optimization",
            severity: "warning",
            title: `Only ${(helpfulRate * 100).toFixed(0)}% of interventions rated "helpful"`,
            description:
              "User satisfaction with system interventions is low. Quality needs improvement.",
            metric: "helpful_rate",
            currentValue: helpfulRate,
            threshold: 0.5,
            action:
              "1) Analyze which intervention types get negative feedback. 2) Improve timing and content. 3) Consider reducing intervention frequency.",
          });
        }
      }
    }

    // 10. Cost efficiency - revenue vs AI cost ratio
    if (
      bizMetrics &&
      bizMetrics.length > 0 &&
      aiUsage7d &&
      aiUsage7d.length > 0
    ) {
      const dailyAiCost =
        aiUsage7d.reduce((s, r: AiUsageRow) => s + (r.estimated_cost || 0), 0) /
        7;
      const monthlyAiCost = dailyAiCost * 30;
      const mrr = bizMetrics[0].mrr_pln || 0;

      if (mrr > 0) {
        const costRatio = monthlyAiCost / mrr;
        if (costRatio > 0.3) {
          insights.push({
            id: "revenue-high-ai-cost-ratio",
            type: "revenue",
            severity: costRatio > 0.5 ? "critical" : "warning",
            title: `AI cost is ${(costRatio * 100).toFixed(0)}% of MRR ($${monthlyAiCost.toFixed(2)}/mo vs ${mrr} PLN MRR)`,
            description:
              "AI costs consuming large portion of revenue. Margin optimization needed.",
            metric: "ai_cost_to_mrr_ratio",
            currentValue: costRatio,
            threshold: 0.3,
            action:
              "1) Increase prompt caching. 2) Route more to Flash/Haiku. 3) Batch similar requests. 4) Consider raising prices.",
          });
        }
      }
    }

    // Sort: critical first, then warnings, then info
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    insights.sort(
      (a, b) =>
        (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2),
    );

    return NextResponse.json({
      insights,
      generatedAt: new Date().toISOString(),
      totalInsights: insights.length,
      criticalCount: insights.filter((i) => i.severity === "critical").length,
      warningCount: insights.filter((i) => i.severity === "warning").length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminInsights] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
