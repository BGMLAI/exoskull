// ============================================================================
// Engagement Scoring - Daily engagement + churn risk calculation
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { getTasks } from "@/lib/tasks/task-service";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type EngagementLevel =
  | "dormant"
  | "low"
  | "medium"
  | "high"
  | "power_user";

export interface EngagementScore {
  tenant_id: string;
  date: string;
  conversation_score: number;
  task_score: number;
  health_score: number;
  mod_usage_score: number;
  voice_score: number;
  total_score: number;
  engagement_level: EngagementLevel;
  churn_risk: number;
  days_since_last_interaction: number;
}

/**
 * Calculate engagement score for a single tenant.
 */
export async function calculateEngagementScore(
  tenantId: string,
): Promise<EngagementScore> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Parallel data collection
  const [conversations, tasks, health, mods, voice, lastActivity] =
    await Promise.all([
      // Conversations in last 7 days
      supabase
        .from("exo_conversations")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", sevenDaysAgo),

      // Tasks created/completed in last 7 days (via task-service: dual-read Tyrolka first, legacy fallback)
      getTasks(tenantId, undefined, supabase).then((allTasks) => ({
        count: allTasks.filter(
          (t) => t.created_at && t.created_at >= sevenDaysAgo,
        ).length,
      })),

      // Health logs in last 7 days
      supabase
        .from("exo_health_metrics")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("recorded_at", sevenDaysAgo),

      // Active mods
      supabase
        .from("exo_user_mods")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true),

      // Voice sessions in last 7 days
      supabase
        .from("exo_conversations")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("channel", "voice")
        .gte("created_at", sevenDaysAgo),

      // Last interaction
      supabase
        .from("exo_conversations")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

  // Score components (0-100 each)
  const conversationScore = Math.min(100, (conversations.count || 0) * 15); // 7 convos = 100
  const taskScore = Math.min(100, (tasks.count || 0) * 10); // 10 tasks = 100
  const healthScore = Math.min(100, (health.count || 0) * 15); // 7 logs = 100
  const modScore = Math.min(100, (mods.count || 0) * 25); // 4 mods = 100
  const voiceScore = Math.min(100, (voice.count || 0) * 20); // 5 calls = 100

  // Weighted total (0-100)
  const totalScore = Math.round(
    conversationScore * 0.3 +
      taskScore * 0.2 +
      healthScore * 0.15 +
      modScore * 0.15 +
      voiceScore * 0.2,
  );

  // Engagement level
  let engagementLevel: EngagementLevel;
  if (totalScore >= 80) engagementLevel = "power_user";
  else if (totalScore >= 50) engagementLevel = "high";
  else if (totalScore >= 25) engagementLevel = "medium";
  else if (totalScore >= 5) engagementLevel = "low";
  else engagementLevel = "dormant";

  // Days since last interaction
  const lastDate = lastActivity.data?.created_at;
  const daysSince = lastDate
    ? Math.floor(
        (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24),
      )
    : 999;

  // Churn risk (0.0 to 1.0)
  let churnRisk = 0;
  if (daysSince >= 30) churnRisk = 0.95;
  else if (daysSince >= 14) churnRisk = 0.75;
  else if (daysSince >= 7) churnRisk = 0.5;
  else if (daysSince >= 3) churnRisk = 0.25;
  else churnRisk = 0.05;

  // Adjust by engagement level
  if (engagementLevel === "power_user") churnRisk *= 0.3;
  else if (engagementLevel === "high") churnRisk *= 0.5;
  else if (engagementLevel === "dormant")
    churnRisk = Math.min(churnRisk + 0.3, 1.0);

  churnRisk = Math.round(churnRisk * 100) / 100;

  const score: EngagementScore = {
    tenant_id: tenantId,
    date: today,
    conversation_score: conversationScore,
    task_score: taskScore,
    health_score: healthScore,
    mod_usage_score: modScore,
    voice_score: voiceScore,
    total_score: totalScore,
    engagement_level: engagementLevel,
    churn_risk: churnRisk,
    days_since_last_interaction: daysSince,
  };

  // Upsert score
  await supabase
    .from("exo_engagement_scores")
    .upsert(score, { onConflict: "tenant_id,date" });

  return score;
}

/**
 * Calculate engagement scores for all active tenants.
 */
export async function calculateAllEngagementScores(): Promise<{
  processed: number;
  errors: number;
}> {
  const supabase = getServiceClient();

  const { data: tenants } = await supabase
    .from("exo_tenants")
    .select("id")
    .in("subscription_status", ["active", "trial"]);

  let processed = 0;
  let errors = 0;

  for (const tenant of tenants || []) {
    try {
      await calculateEngagementScore(tenant.id);
      processed++;
    } catch (error) {
      console.error("[Engagement] Score error:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId: tenant.id,
      });
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Get users with high churn risk.
 */
export async function getChurnRiskUsers(threshold: number = 0.5): Promise<
  Array<{
    tenant_id: string;
    churn_risk: number;
    days_since_last_interaction: number;
    engagement_level: EngagementLevel;
  }>
> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("exo_engagement_scores")
    .select(
      "tenant_id, churn_risk, days_since_last_interaction, engagement_level",
    )
    .eq("date", today)
    .gte("churn_risk", threshold)
    .order("churn_risk", { ascending: false })
    .limit(50);

  return (data || []) as any;
}
