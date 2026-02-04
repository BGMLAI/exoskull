// ============================================================================
// Referral System - Generate codes, track signups, grant rewards
// ============================================================================

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface ReferralStats {
  totalReferrals: number;
  signedUp: number;
  converted: number;
  totalRewards: number;
  referralCode: string | null;
}

/**
 * Generate or retrieve referral code for a tenant.
 */
export async function generateReferralCode(tenantId: string): Promise<string> {
  const supabase = getServiceClient();

  const { data } = await supabase.rpc("generate_referral_code", {
    p_tenant_id: tenantId,
  });

  return data as string;
}

/**
 * Process a signup that came through a referral.
 */
export async function processReferralSignup(
  referralCode: string,
  newTenantId: string,
  newEmail: string,
): Promise<{ success: boolean; referrerId?: string }> {
  const supabase = getServiceClient();

  try {
    // Find referrer
    const { data: referrer } = await supabase
      .from("exo_tenants")
      .select("id")
      .eq("referral_code", referralCode)
      .single();

    if (!referrer) {
      console.warn("[Referrals] Invalid referral code:", { referralCode });
      return { success: false };
    }

    // Create referral record
    await supabase.from("exo_referrals").insert({
      referrer_id: referrer.id,
      referred_email: newEmail,
      referral_code: referralCode,
      status: "signed_up",
      referred_tenant_id: newTenantId,
    });

    // Update new tenant with referrer info
    await supabase
      .from("exo_tenants")
      .update({
        referred_by: referrer.id,
        acquisition_channel: "referral",
      })
      .eq("id", newTenantId);

    console.log("[Referrals] Signup tracked:", {
      referrerCode: referralCode,
      referrerId: referrer.id,
      newTenantId,
    });

    return { success: true, referrerId: referrer.id };
  } catch (error) {
    console.error("[Referrals] processReferralSignup error:", {
      error: error instanceof Error ? error.message : String(error),
      referralCode,
      newTenantId,
    });
    return { success: false };
  }
}

/**
 * Mark referral as activated (user started using the product).
 */
export async function markReferralActivated(tenantId: string): Promise<void> {
  const supabase = getServiceClient();

  await supabase
    .from("exo_referrals")
    .update({ status: "activated" })
    .eq("referred_tenant_id", tenantId)
    .eq("status", "signed_up");
}

/**
 * Grant referral reward when referred user converts to paid.
 */
export async function grantReferralReward(
  referredTenantId: string,
): Promise<void> {
  const supabase = getServiceClient();

  try {
    // Get referral
    const { data: referral } = await supabase
      .from("exo_referrals")
      .select("*")
      .eq("referred_tenant_id", referredTenantId)
      .in("status", ["signed_up", "activated"])
      .single();

    if (!referral) return;

    // Default reward: 50 credits (50 PLN value)
    const rewardAmount = 50;

    // Update referral status
    await supabase
      .from("exo_referrals")
      .update({
        status: "rewarded",
        reward_type: "credits",
        reward_amount: rewardAmount,
        reward_granted_at: new Date().toISOString(),
        converted_at: new Date().toISOString(),
      })
      .eq("id", referral.id);

    // Log business event
    await supabase.from("exo_business_events").insert({
      tenant_id: referral.referrer_id,
      event_type: "credit_purchased",
      amount_pln: rewardAmount,
      metadata: {
        source: "referral_reward",
        referred_tenant_id: referredTenantId,
      },
    });

    console.log("[Referrals] Reward granted:", {
      referrerId: referral.referrer_id,
      referredTenantId,
      reward: rewardAmount,
    });
  } catch (error) {
    console.error("[Referrals] grantReferralReward error:", {
      error: error instanceof Error ? error.message : String(error),
      referredTenantId,
    });
  }
}

/**
 * Get referral stats for a tenant.
 */
export async function getReferralStats(
  tenantId: string,
): Promise<ReferralStats> {
  const supabase = getServiceClient();

  const { data: stats } = await supabase.rpc("get_referral_stats", {
    p_tenant_id: tenantId,
  });

  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("referral_code")
    .eq("id", tenantId)
    .single();

  const row = stats as any;
  return {
    totalReferrals: row?.total_referrals || 0,
    signedUp: row?.signed_up || 0,
    converted: row?.converted || 0,
    totalRewards: row?.total_rewards || 0,
    referralCode: tenant?.referral_code || null,
  };
}
