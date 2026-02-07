// ============================================================================
// Business Metrics - MRR, Churn, LTV, Daily Calculations
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import type { BusinessDailyMetrics, CohortData, ChannelRevenue } from "./types";

import { logger } from "@/lib/logger";
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Calculate and store daily business metrics.
 * Called by cron at 05:00 UTC daily.
 */
export async function calculateDailyMetrics(): Promise<BusinessDailyMetrics> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // --- Total users ---
  const { count: totalUsers } = await supabase
    .from("exo_tenants")
    .select("*", { count: "exact", head: true });

  // --- Paying users (subscription_status = 'active') ---
  const { count: payingUsers } = await supabase
    .from("exo_tenants")
    .select("*", { count: "exact", head: true })
    .eq("subscription_status", "active")
    .neq("subscription_tier", "free");

  // --- Trial users ---
  const { count: trialUsers } = await supabase
    .from("exo_tenants")
    .select("*", { count: "exact", head: true })
    .eq("subscription_status", "trial");

  // --- Active users (30d) ---
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count: activeUsers30d } = await supabase
    .from("exo_conversations")
    .select("tenant_id", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  // --- Revenue today ---
  const todayStart = `${today}T00:00:00Z`;
  const todayEnd = `${today}T23:59:59Z`;
  const { data: todayEvents } = await supabase
    .from("exo_business_events")
    .select("amount_pln")
    .eq("event_type", "payment_succeeded")
    .gte("created_at", todayStart)
    .lte("created_at", todayEnd);

  const revenueToday = (todayEvents || []).reduce(
    (sum, e) => sum + (e.amount_pln || 0),
    0,
  );

  // --- MRR (sum of all active subscriptions' monthly revenue) ---
  const { data: activeSubscriptions } = await supabase
    .from("exo_business_events")
    .select("tenant_id, amount_pln")
    .eq("event_type", "subscription_started")
    .order("created_at", { ascending: false });

  // Deduplicate to latest per tenant
  const latestPerTenant = new Map<string, number>();
  for (const sub of activeSubscriptions || []) {
    if (!latestPerTenant.has(sub.tenant_id)) {
      latestPerTenant.set(sub.tenant_id, sub.amount_pln || 0);
    }
  }

  // Only count tenants with active status
  const { data: activeTenants } = await supabase
    .from("exo_tenants")
    .select("id")
    .eq("subscription_status", "active")
    .neq("subscription_tier", "free");

  let mrr = 0;
  for (const tenant of activeTenants || []) {
    mrr += latestPerTenant.get(tenant.id) || 0;
  }

  const arr = mrr * 12;

  // --- Churn (cancelled in last 30d / paying at start of period) ---
  const { count: churnedUsers30d } = await supabase
    .from("exo_business_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "subscription_cancelled")
    .gte("created_at", thirtyDaysAgo);

  const payingAtStart = (payingUsers || 0) + (churnedUsers30d || 0);
  const churnRate =
    payingAtStart > 0 ? (churnedUsers30d || 0) / payingAtStart : 0;

  // --- Trial to paid conversion ---
  const { count: totalTrialEnded } = await supabase
    .from("exo_business_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "trial_ended")
    .gte("created_at", thirtyDaysAgo);

  const { count: totalTrialConverted } = await supabase
    .from("exo_business_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "trial_converted")
    .gte("created_at", thirtyDaysAgo);

  const trialToPaidRate =
    (totalTrialEnded || 0) > 0
      ? (totalTrialConverted || 0) / (totalTrialEnded || 1)
      : 0;

  // --- ARPU ---
  const arpu = (payingUsers || 0) > 0 ? mrr / (payingUsers || 1) : 0;

  // --- LTV (ARPU / churn rate) ---
  const ltv = churnRate > 0 ? arpu / churnRate : arpu * 24; // Default 24 months if no churn

  const metrics: BusinessDailyMetrics = {
    date: today,
    mrr_pln: Math.round(mrr * 100) / 100,
    arr_pln: Math.round(arr * 100) / 100,
    revenue_today_pln: Math.round(revenueToday * 100) / 100,
    total_users: totalUsers || 0,
    active_users_30d: activeUsers30d || 0,
    paying_users: payingUsers || 0,
    trial_users: trialUsers || 0,
    churned_users_30d: churnedUsers30d || 0,
    churn_rate_30d: Math.round(churnRate * 10000) / 10000,
    trial_to_paid_rate: Math.round(trialToPaidRate * 10000) / 10000,
    arpu_pln: Math.round(arpu * 100) / 100,
    ltv_estimated_pln: Math.round(ltv * 100) / 100,
  };

  // Upsert into daily metrics table
  const { error } = await supabase.from("exo_business_daily_metrics").upsert(
    {
      ...metrics,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );

  if (error) {
    console.error("[BusinessMetrics] Failed to store daily metrics:", {
      error: error.message,
      date: today,
    });
    throw error;
  }

  logger.info("[BusinessMetrics] Daily metrics calculated:", {
    date: today,
    mrr: metrics.mrr_pln,
    churn: metrics.churn_rate_30d,
    activeUsers: metrics.active_users_30d,
  });

  return metrics;
}

/**
 * Get MRR with month-over-month change.
 */
export async function getMRR(): Promise<{
  mrr: number;
  change: number;
  changePercent: number;
}> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from("exo_business_daily_metrics")
    .select("mrr_pln, date")
    .order("date", { ascending: false })
    .limit(2);

  if (!data || data.length === 0) {
    return { mrr: 0, change: 0, changePercent: 0 };
  }

  const current = data[0].mrr_pln || 0;
  const previous = data.length > 1 ? data[1].mrr_pln || 0 : 0;
  const change = current - previous;
  const changePercent = previous > 0 ? (change / previous) * 100 : 0;

  return {
    mrr: current,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
  };
}

/**
 * Get churn rate for a given period.
 */
export async function getChurnRate(
  days: number = 30,
): Promise<{ rate: number; count: number }> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from("exo_business_daily_metrics")
    .select("churn_rate_30d, churned_users_30d")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  return {
    rate: data?.churn_rate_30d || 0,
    count: data?.churned_users_30d || 0,
  };
}

/**
 * Get estimated customer lifetime value.
 */
export async function getLTV(): Promise<{
  ltv: number;
  avgLifespanMonths: number;
}> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from("exo_business_daily_metrics")
    .select("ltv_estimated_pln, churn_rate_30d, arpu_pln")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const churnRate = data?.churn_rate_30d || 0;
  const avgLifespan = churnRate > 0 ? 1 / churnRate : 24;

  return {
    ltv: data?.ltv_estimated_pln || 0,
    avgLifespanMonths: Math.round(avgLifespan * 10) / 10,
  };
}

/**
 * Get cohort retention data.
 */
export async function getCohortRetention(
  months: number = 6,
): Promise<CohortData[]> {
  const supabase = getServiceClient();
  const cohorts: CohortData[] = [];

  for (let i = 0; i < months; i++) {
    const cohortDate = new Date();
    cohortDate.setMonth(cohortDate.getMonth() - i);
    const cohortMonth = cohortDate.toISOString().slice(0, 7); // YYYY-MM

    const startOfMonth = `${cohortMonth}-01T00:00:00Z`;
    const endOfMonth =
      new Date(cohortDate.getFullYear(), cohortDate.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0] + "T23:59:59Z";

    // Users who signed up this month
    const { count: cohortSize } = await supabase
      .from("exo_tenants")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth)
      .lte("created_at", endOfMonth);

    if (!cohortSize || cohortSize === 0) {
      cohorts.push({
        cohort_month: cohortMonth,
        total_users: 0,
        retention: [],
      });
      continue;
    }

    // Calculate retention for each subsequent month
    const retention: number[] = [1.0]; // Month 0 = 100%

    for (let m = 1; m <= i; m++) {
      const checkDate = new Date(
        cohortDate.getFullYear(),
        cohortDate.getMonth() + m,
        1,
      );
      const checkMonth = checkDate.toISOString().slice(0, 7);
      const checkStart = `${checkMonth}-01T00:00:00Z`;
      const checkEnd =
        new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0] + "T23:59:59Z";

      // Count users from cohort who were active this month
      const { data: activeInMonth } = await supabase
        .from("exo_conversations")
        .select("tenant_id")
        .gte("created_at", checkStart)
        .lte("created_at", checkEnd);

      const uniqueActive = new Set(
        (activeInMonth || []).map((c) => c.tenant_id),
      );
      retention.push(Math.round((uniqueActive.size / cohortSize) * 100) / 100);
    }

    cohorts.push({
      cohort_month: cohortMonth,
      total_users: cohortSize,
      retention,
    });
  }

  return cohorts;
}

/**
 * Get revenue attributed by acquisition channel.
 */
export async function getRevenueByChannel(): Promise<ChannelRevenue[]> {
  const supabase = getServiceClient();

  const { data: tenants } = await supabase
    .from("exo_tenants")
    .select("id, acquisition_channel, total_paid_pln")
    .not("acquisition_channel", "is", null);

  const channels = new Map<string, { revenue: number; count: number }>();

  for (const t of tenants || []) {
    const channel = t.acquisition_channel || "organic";
    const existing = channels.get(channel) || { revenue: 0, count: 0 };
    existing.revenue += t.total_paid_pln || 0;
    existing.count += 1;
    channels.set(channel, existing);
  }

  return Array.from(channels.entries()).map(([channel, data]) => ({
    channel,
    revenue_pln: Math.round(data.revenue * 100) / 100,
    user_count: data.count,
    avg_revenue_per_user:
      data.count > 0 ? Math.round((data.revenue / data.count) * 100) / 100 : 0,
  }));
}
