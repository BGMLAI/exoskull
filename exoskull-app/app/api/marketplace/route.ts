/**
 * Marketplace API — Publish, discover, download, and rate skills.
 *
 * POST /api/marketplace
 *   Actions: publish, discover, download, review, get_reviews,
 *            connect_onboarding, creator_stats
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  publishSkill,
  discoverListings,
  downloadSkill,
  reviewListing,
  getListingReviews,
} from "@/lib/marketplace/marketplace";
import {
  createConnectOnboardingLink,
  getCreatorStats,
} from "@/lib/marketplace/royalties";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case "publish": {
        const result = await publishSkill(user.id, {
          skillId: body.skill_id,
          name: body.name,
          description: body.description,
          category: body.category,
          tags: body.tags,
          pricingModel: body.pricing_model,
          priceAmountPln: body.price_amount_pln,
          creatorName: body.creator_name,
        });
        return NextResponse.json(result);
      }

      case "discover": {
        const result = await discoverListings({
          query: body.query,
          category: body.category,
          pricingModel: body.pricing_model,
          minRating: body.min_rating,
          sortBy: body.sort_by,
          limit: body.limit,
          offset: body.offset,
        });
        return NextResponse.json(result);
      }

      case "download": {
        const result = await downloadSkill(user.id, body.listing_id);
        return NextResponse.json(result);
      }

      case "review": {
        const result = await reviewListing(user.id, body.listing_id, {
          rating: body.rating,
          comment: body.comment,
          reviewerName: body.reviewer_name,
        });
        return NextResponse.json(result);
      }

      case "get_reviews": {
        const reviews = await getListingReviews(
          body.listing_id,
          body.limit || 20,
        );
        return NextResponse.json({ reviews });
      }

      case "connect_onboarding": {
        const result = await createConnectOnboardingLink(user.id);
        return NextResponse.json(result);
      }

      case "creator_stats": {
        const stats = await getCreatorStats(user.id);
        return NextResponse.json({ stats });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/marketplace — Public discovery (no auth required)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const result = await discoverListings({
    query: searchParams.get("q") || undefined,
    category: searchParams.get("category") || undefined,
    sortBy:
      (searchParams.get("sort") as "downloads" | "rating" | "newest") ||
      "newest",
    limit: parseInt(searchParams.get("limit") || "20"),
    offset: parseInt(searchParams.get("offset") || "0"),
  });

  return NextResponse.json(result);
}
