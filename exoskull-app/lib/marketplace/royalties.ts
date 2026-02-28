/**
 * Marketplace Royalties — Revenue sharing via Stripe Connect.
 *
 * Model: 70% creator / 30% platform
 *
 * Flow:
 *   1. Creator onboards to Stripe Connect (express account)
 *   2. Consumer pays for premium skill
 *   3. Payment splits: 70% to creator Connect account, 30% platform
 *   4. Monthly payout report per creator
 *
 * Stripe Connect requirements:
 *   - STRIPE_SECRET_KEY (platform account)
 *   - Creator must complete Stripe Connect onboarding
 *   - Minimum payout: 10 PLN
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Creator gets 70%, platform 30% */
const CREATOR_SHARE = 0.7;
const PLATFORM_SHARE = 0.3;

/** Minimum payout threshold in PLN */
const MIN_PAYOUT_PLN = 10;

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorAccount {
  tenantId: string;
  stripeConnectId: string | null;
  onboardingComplete: boolean;
  totalEarnedPln: number;
  totalPaidOutPln: number;
  pendingPayoutPln: number;
}

export interface RoyaltyPayment {
  id: string;
  creatorTenantId: string;
  listingId: string;
  downloadId: string;
  grossAmountPln: number;
  creatorSharePln: number;
  platformSharePln: number;
  status: "pending" | "paid" | "failed";
  stripeTransferId: string | null;
  createdAt: string;
}

// ============================================================================
// STRIPE CONNECT ONBOARDING
// ============================================================================

/**
 * Create a Stripe Connect onboarding link for a creator.
 * Returns a URL the creator should visit to complete onboarding.
 */
export async function createConnectOnboardingLink(
  tenantId: string,
): Promise<{ url: string | null; error?: string }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { url: null, error: "STRIPE_SECRET_KEY not configured" };
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const supabase = getServiceSupabase();

    // Check if creator already has a Connect account
    const { data: existing } = await supabase
      .from("exo_marketplace_creators")
      .select("stripe_connect_id, onboarding_complete")
      .eq("tenant_id", tenantId)
      .single();

    let connectId = existing?.stripe_connect_id;

    if (!connectId) {
      // Create new Connect Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "PL",
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { tenant_id: tenantId },
      });

      connectId = account.id;

      // Store Connect account ID
      await supabase.from("exo_marketplace_creators").upsert(
        {
          tenant_id: tenantId,
          stripe_connect_id: connectId,
          onboarding_complete: false,
          total_earned_pln: 0,
          total_paid_out_pln: 0,
          pending_payout_pln: 0,
        },
        { onConflict: "tenant_id" },
      );
    }

    // Create onboarding link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.exoskull.io";
    const accountLink = await stripe.accountLinks.create({
      account: connectId,
      refresh_url: `${appUrl}/dashboard/settings/integrations?connect=refresh`,
      return_url: `${appUrl}/dashboard/settings/integrations?connect=complete`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  } catch (err) {
    logger.error("[Royalties] Connect onboarding failed:", err);
    return {
      url: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// ROYALTY RECORDING
// ============================================================================

/**
 * Record a royalty payment when a premium skill is downloaded.
 * Called after successful payment processing.
 */
export async function recordRoyalty(
  creatorTenantId: string,
  listingId: string,
  downloadId: string,
  grossAmountPln: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceSupabase();

  const creatorSharePln =
    Math.round(grossAmountPln * CREATOR_SHARE * 100) / 100;
  const platformSharePln =
    Math.round(grossAmountPln * PLATFORM_SHARE * 100) / 100;

  const { error } = await supabase.from("exo_marketplace_royalties").insert({
    creator_tenant_id: creatorTenantId,
    listing_id: listingId,
    download_id: downloadId,
    gross_amount_pln: grossAmountPln,
    creator_share_pln: creatorSharePln,
    platform_share_pln: platformSharePln,
    status: "pending",
  });

  if (error) {
    logger.error("[Royalties] Record failed:", error.message);
    return { success: false, error: error.message };
  }

  // Update creator's pending payout
  await supabase.rpc("increment_creator_pending", {
    p_tenant_id: creatorTenantId,
    p_amount: creatorSharePln,
  });

  return { success: true };
}

// ============================================================================
// PAYOUT PROCESSING
// ============================================================================

/**
 * Process pending royalty payouts for all creators.
 * Called by CRON monthly.
 */
export async function processPayouts(): Promise<{
  processed: number;
  totalPaidPln: number;
  errors: string[];
}> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      processed: 0,
      totalPaidPln: 0,
      errors: ["STRIPE_SECRET_KEY not configured"],
    };
  }

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let processed = 0;
  let totalPaidPln = 0;

  // Get creators with pending payouts >= minimum
  const { data: creators } = await supabase
    .from("exo_marketplace_creators")
    .select("*")
    .eq("onboarding_complete", true)
    .gte("pending_payout_pln", MIN_PAYOUT_PLN)
    .not("stripe_connect_id", "is", null);

  if (!creators?.length) {
    return { processed: 0, totalPaidPln: 0, errors: [] };
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    for (const creator of creators) {
      try {
        // Create transfer to Connect account
        const transfer = await stripe.transfers.create({
          amount: Math.round(creator.pending_payout_pln * 100), // PLN in grosz
          currency: "pln",
          destination: creator.stripe_connect_id,
          metadata: {
            tenant_id: creator.tenant_id,
            payout_type: "marketplace_royalty",
          },
        });

        // Update creator record
        await supabase
          .from("exo_marketplace_creators")
          .update({
            total_paid_out_pln:
              (creator.total_paid_out_pln || 0) + creator.pending_payout_pln,
            pending_payout_pln: 0,
            last_payout_at: new Date().toISOString(),
          })
          .eq("tenant_id", creator.tenant_id);

        // Mark royalties as paid
        await supabase
          .from("exo_marketplace_royalties")
          .update({
            status: "paid",
            stripe_transfer_id: transfer.id,
            paid_at: new Date().toISOString(),
          })
          .eq("creator_tenant_id", creator.tenant_id)
          .eq("status", "pending");

        processed++;
        totalPaidPln += creator.pending_payout_pln;

        logger.info("[Royalties] Payout processed:", {
          tenantId: creator.tenant_id,
          amountPln: creator.pending_payout_pln,
          transferId: transfer.id,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${creator.tenant_id}: ${msg}`);
        logger.error("[Royalties] Payout failed for creator:", {
          tenantId: creator.tenant_id,
          error: msg,
        });
      }
    }
  } catch (err) {
    errors.push(
      `Stripe init: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { processed, totalPaidPln, errors };
}

// ============================================================================
// CREATOR STATS
// ============================================================================

/**
 * Get royalty stats for a creator.
 */
export async function getCreatorStats(
  tenantId: string,
): Promise<CreatorAccount | null> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_marketplace_creators")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!data) return null;

  return {
    tenantId: data.tenant_id,
    stripeConnectId: data.stripe_connect_id,
    onboardingComplete: data.onboarding_complete,
    totalEarnedPln: data.total_earned_pln || 0,
    totalPaidOutPln: data.total_paid_out_pln || 0,
    pendingPayoutPln: data.pending_payout_pln || 0,
  };
}
