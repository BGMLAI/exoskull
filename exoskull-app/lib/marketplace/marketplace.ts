/**
 * Marketplace Service — Publish, discover, download, and rate skills/apps.
 *
 * Flow:
 *   Creator publishes skill → review (auto for low-risk) → listed
 *   Consumer discovers → downloads → installs as dynamic tool
 *   Usage tracked → royalty calculated → payout via Stripe Connect
 *
 * Skill tiers:
 *   - free: no payment required
 *   - premium: one-time payment
 *   - subscription: recurring payment
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type ListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export type PricingModel = "free" | "premium" | "subscription";

export interface MarketplaceListing {
  id: string;
  creatorTenantId: string;
  creatorName: string;
  skillId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  pricingModel: PricingModel;
  priceAmountPln: number;
  status: ListingStatus;
  version: string;
  downloads: number;
  averageRating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceReview {
  id: string;
  listingId: string;
  reviewerTenantId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ============================================================================
// PUBLISH
// ============================================================================

/**
 * Publish a skill to the marketplace.
 */
export async function publishSkill(
  tenantId: string,
  config: {
    skillId: string;
    name: string;
    description: string;
    category: string;
    tags?: string[];
    pricingModel?: PricingModel;
    priceAmountPln?: number;
    creatorName?: string;
  },
): Promise<{ success: boolean; listingId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Verify skill exists and belongs to tenant
  const { data: skill } = await supabase
    .from("exo_generated_skills")
    .select("id, name, approval_status")
    .eq("id", config.skillId)
    .eq("tenant_id", tenantId)
    .single();

  if (!skill) {
    return { success: false, error: "Skill not found or not yours" };
  }

  if (skill.approval_status !== "approved") {
    return {
      success: false,
      error: "Skill must be approved before publishing",
    };
  }

  // Auto-publish free skills, review premium
  const status: ListingStatus =
    config.pricingModel === "free" ? "published" : "pending_review";

  const { data, error } = await supabase
    .from("exo_marketplace_listings")
    .insert({
      creator_tenant_id: tenantId,
      creator_name: config.creatorName || "Anonymous",
      skill_id: config.skillId,
      name: config.name,
      description: config.description,
      category: config.category,
      tags: config.tags || [],
      pricing_model: config.pricingModel || "free",
      price_amount_pln: config.priceAmountPln || 0,
      status,
      version: "1.0.0",
      downloads: 0,
      average_rating: 0,
      review_count: 0,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[Marketplace] Publish failed:", error.message);
    return { success: false, error: error.message };
  }

  logger.info("[Marketplace] Skill published:", {
    listingId: data?.id,
    skillId: config.skillId,
    tenantId,
    status,
  });

  return { success: true, listingId: data?.id };
}

// ============================================================================
// DISCOVER
// ============================================================================

/**
 * Search marketplace listings.
 */
export async function discoverListings(filters?: {
  query?: string;
  category?: string;
  pricingModel?: PricingModel;
  minRating?: number;
  sortBy?: "downloads" | "rating" | "newest";
  limit?: number;
  offset?: number;
}): Promise<{ listings: MarketplaceListing[]; total: number }> {
  const supabase = getServiceSupabase();

  let query = supabase
    .from("exo_marketplace_listings")
    .select("*", { count: "exact" })
    .eq("status", "published");

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  if (filters?.pricingModel) {
    query = query.eq("pricing_model", filters.pricingModel);
  }

  if (filters?.minRating) {
    query = query.gte("average_rating", filters.minRating);
  }

  if (filters?.query) {
    query = query.or(
      `name.ilike.%${filters.query}%,description.ilike.%${filters.query}%`,
    );
  }

  // Sort
  switch (filters?.sortBy) {
    case "downloads":
      query = query.order("downloads", { ascending: false });
      break;
    case "rating":
      query = query.order("average_rating", { ascending: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(
    filters?.offset || 0,
    (filters?.offset || 0) + (filters?.limit || 20) - 1,
  );

  const { data, count, error } = await query;

  if (error) {
    logger.error("[Marketplace] Discover failed:", error.message);
    return { listings: [], total: 0 };
  }

  return {
    listings: (data || []).map(mapListingRow),
    total: count || 0,
  };
}

// ============================================================================
// DOWNLOAD / INSTALL
// ============================================================================

/**
 * Download (install) a marketplace skill for a tenant.
 * Copies the skill code and registers as a dynamic tool.
 */
export async function downloadSkill(
  tenantId: string,
  listingId: string,
): Promise<{ success: boolean; skillId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Get listing + source skill
  const { data: listing } = await supabase
    .from("exo_marketplace_listings")
    .select("*, skill_id, creator_tenant_id, pricing_model, price_amount_pln")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (!listing) {
    return { success: false, error: "Listing not found or not published" };
  }

  // Check if already downloaded
  const { data: existing } = await supabase
    .from("exo_marketplace_downloads")
    .select("id")
    .eq("listing_id", listingId)
    .eq("tenant_id", tenantId)
    .single();

  if (existing) {
    return { success: false, error: "Already downloaded" };
  }

  // For premium skills, verify payment (simplified — full flow would use Stripe)
  if (listing.pricing_model !== "free" && listing.price_amount_pln > 0) {
    // TODO: Verify payment via Stripe checkout session
    logger.warn("[Marketplace] Premium skill download without payment check:", {
      listingId,
      tenantId,
    });
  }

  // Get source skill code
  const { data: sourceSkill } = await supabase
    .from("exo_generated_skills")
    .select("executor_code, capabilities, allowed_tools, risk_level")
    .eq("id", listing.skill_id)
    .single();

  if (!sourceSkill) {
    return { success: false, error: "Source skill not found" };
  }

  // Create a copy for the downloading tenant
  const { data: newSkill, error: copyError } = await supabase
    .from("exo_generated_skills")
    .insert({
      tenant_id: tenantId,
      slug: `marketplace-${listing.skill_id.slice(0, 8)}`,
      name: listing.name,
      description: listing.description,
      version: 1,
      tier: "community",
      executor_code: sourceSkill.executor_code,
      capabilities: sourceSkill.capabilities,
      allowed_tools: sourceSkill.allowed_tools,
      risk_level: sourceSkill.risk_level,
      approval_status: "approved", // Pre-approved (was reviewed for marketplace)
      approved_at: new Date().toISOString(),
      approved_by: "marketplace",
      generation_prompt: `Marketplace download: ${listing.name}`,
      generated_by: "marketplace",
    })
    .select("id")
    .single();

  if (copyError) {
    logger.error("[Marketplace] Skill copy failed:", copyError.message);
    return { success: false, error: copyError.message };
  }

  // Record download
  await supabase.from("exo_marketplace_downloads").insert({
    listing_id: listingId,
    tenant_id: tenantId,
    skill_id: newSkill?.id,
    price_paid_pln:
      listing.pricing_model === "free" ? 0 : listing.price_amount_pln,
  });

  // Increment download counter
  await supabase.rpc("increment_marketplace_downloads", {
    p_listing_id: listingId,
  });

  logger.info("[Marketplace] Skill downloaded:", {
    listingId,
    tenantId,
    newSkillId: newSkill?.id,
  });

  return { success: true, skillId: newSkill?.id };
}

// ============================================================================
// RATE / REVIEW
// ============================================================================

/**
 * Leave a review for a marketplace listing.
 */
export async function reviewListing(
  tenantId: string,
  listingId: string,
  review: {
    rating: number;
    comment: string;
    reviewerName?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  if (review.rating < 1 || review.rating > 5) {
    return { success: false, error: "Rating must be 1-5" };
  }

  const supabase = getServiceSupabase();

  // Verify download exists (must download before reviewing)
  const { data: download } = await supabase
    .from("exo_marketplace_downloads")
    .select("id")
    .eq("listing_id", listingId)
    .eq("tenant_id", tenantId)
    .single();

  if (!download) {
    return { success: false, error: "Must download before reviewing" };
  }

  // Upsert review (one per tenant per listing)
  const { error } = await supabase.from("exo_marketplace_reviews").upsert(
    {
      listing_id: listingId,
      reviewer_tenant_id: tenantId,
      reviewer_name: review.reviewerName || "Anonymous",
      rating: review.rating,
      comment: review.comment,
    },
    { onConflict: "listing_id,reviewer_tenant_id" },
  );

  if (error) {
    logger.error("[Marketplace] Review failed:", error.message);
    return { success: false, error: error.message };
  }

  // Update average rating on listing
  const { data: stats } = await supabase
    .from("exo_marketplace_reviews")
    .select("rating")
    .eq("listing_id", listingId);

  if (stats && stats.length > 0) {
    const avg = stats.reduce((sum, r) => sum + r.rating, 0) / stats.length;

    await supabase
      .from("exo_marketplace_listings")
      .update({
        average_rating: Math.round(avg * 10) / 10,
        review_count: stats.length,
      })
      .eq("id", listingId);
  }

  return { success: true };
}

/**
 * Get reviews for a listing.
 */
export async function getListingReviews(
  listingId: string,
  limit = 20,
): Promise<MarketplaceReview[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_marketplace_reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).map((r) => ({
    id: r.id,
    listingId: r.listing_id,
    reviewerTenantId: r.reviewer_tenant_id,
    reviewerName: r.reviewer_name,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

function mapListingRow(row: Record<string, unknown>): MarketplaceListing {
  return {
    id: row.id as string,
    creatorTenantId: row.creator_tenant_id as string,
    creatorName: row.creator_name as string,
    skillId: row.skill_id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as string,
    tags: (row.tags as string[]) || [],
    pricingModel: row.pricing_model as PricingModel,
    priceAmountPln: row.price_amount_pln as number,
    status: row.status as ListingStatus,
    version: row.version as string,
    downloads: row.downloads as number,
    averageRating: row.average_rating as number,
    reviewCount: row.review_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
