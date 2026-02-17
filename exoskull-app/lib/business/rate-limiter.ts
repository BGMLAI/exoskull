// ============================================================================
// Rate Limiter - Per-tier usage enforcement
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import {
  TIER_LIMITS,
  type SubscriptionTier,
  type RateLimitResult,
  type UsageSummary,
} from "./types";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type UsageField =
  | "conversations_count"
  | "ai_requests_count"
  | "voice_minutes"
  | "coding_sessions_count";

const RESOURCE_TO_FIELD: Record<string, UsageField> = {
  conversations: "conversations_count",
  ai_requests: "ai_requests_count",
  voice_minutes: "voice_minutes",
  coding_sessions: "coding_sessions_count",
};

const RESOURCE_TO_LIMIT: Record<string, keyof (typeof TIER_LIMITS)["free"]> = {
  conversations: "conversations_daily",
  ai_requests: "ai_requests_daily",
  voice_minutes: "voice_minutes_daily",
  coding_sessions: "coding_sessions_daily",
};

// Admin bypass - set ADMIN_TENANT_IDS in .env (comma-separated)
const ADMIN_IDS = (process.env.ADMIN_TENANT_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Check if a tenant can use a resource based on their tier limits.
 */
export async function checkRateLimit(
  tenantId: string,
  resource: string,
): Promise<RateLimitResult> {
  // Admin bypass - unlimited access
  if (ADMIN_IDS.includes(tenantId)) {
    return {
      allowed: true,
      resource,
      current: 0,
      limit: -1,
      tier: "enterprise",
    };
  }

  const supabase = getServiceClient();

  // Check admin_users table for admin bypass
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (adminUser) {
    return {
      allowed: true,
      resource,
      current: 0,
      limit: -1,
      tier: "enterprise",
    };
  }

  // Get tenant tier
  const { data: tenant, error: tenantError } = await supabase
    .from("exo_tenants")
    .select("subscription_tier, subscription_status")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    console.error("[RateLimiter] Tenant not found:", {
      tenantId,
      error: tenantError?.message,
    });
    return {
      allowed: false,
      resource,
      current: 0,
      limit: 0,
      tier: "free",
      upgradeMessage: "Nie znaleziono konta.",
    };
  }

  const tier = (tenant.subscription_tier || "free") as SubscriptionTier;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

  const limitKey = RESOURCE_TO_LIMIT[resource];
  if (!limitKey) {
    // Unknown resource - allow by default
    return { allowed: true, resource, current: 0, limit: -1, tier };
  }

  const limit = limits[limitKey];

  // Unlimited
  if (limit === -1) {
    return { allowed: true, resource, current: 0, limit: -1, tier };
  }

  // Get current usage
  const field = RESOURCE_TO_FIELD[resource];
  const { data: usage } = await supabase
    .from("exo_usage_daily")
    .select(field)
    .eq("tenant_id", tenantId)
    .eq("date", new Date().toISOString().split("T")[0])
    .single();

  const current = usage ? (usage as Record<string, number>)[field] || 0 : 0;

  if (current >= limit) {
    const tierNames: Record<SubscriptionTier, string> = {
      free: "Darmowy",
      basic: "Basic",
      pro: "Pro",
      business: "Business",
      enterprise: "Enterprise",
    };

    // Find next tier with higher limit
    const tierOrder: SubscriptionTier[] = [
      "free",
      "basic",
      "pro",
      "business",
      "enterprise",
    ];
    const currentIndex = tierOrder.indexOf(tier);
    const nextTier = tierOrder[currentIndex + 1];

    return {
      allowed: false,
      resource,
      current,
      limit,
      tier,
      upgradeMessage: nextTier
        ? `Osiagnales limit ${limit} ${resource} dziennie na planie ${tierNames[tier]}. Przejdz na plan ${tierNames[nextTier]} po wiecej.`
        : `Osiagnales limit ${limit} ${resource} dziennie.`,
    };
  }

  return { allowed: true, resource, current, limit, tier };
}

/**
 * Increment usage counter for a resource.
 * Call this after successful resource consumption.
 */
export async function incrementUsage(
  tenantId: string,
  resource: string,
  amount: number = 1,
): Promise<void> {
  const supabase = getServiceClient();
  const field = RESOURCE_TO_FIELD[resource];

  if (!field) return;

  try {
    await supabase.rpc("increment_usage", {
      p_tenant_id: tenantId,
      p_field: field,
      p_amount: amount,
    });
  } catch (error) {
    console.error("[RateLimiter] Failed to increment usage:", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      resource,
      amount,
    });
  }
}

/**
 * Get full usage summary for a tenant.
 */
export async function getUsageSummary(
  tenantId: string,
): Promise<UsageSummary | null> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("exo_usage_daily")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("date", today)
    .single();

  if (!data) {
    return {
      tenant_id: tenantId,
      date: today,
      conversations_count: 0,
      ai_requests_count: 0,
      voice_minutes: 0,
      tokens_used: 0,
    };
  }

  return {
    tenant_id: tenantId,
    date: today,
    conversations_count: data.conversations_count || 0,
    ai_requests_count: data.ai_requests_count || 0,
    voice_minutes: data.voice_minutes || 0,
    tokens_used: data.tokens_used || 0,
  };
}
