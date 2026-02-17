import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { UserProfile } from "@/lib/types/user";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// Fields that can be updated via PATCH
const UPDATABLE_FIELDS = [
  "preferred_name",
  "age_range",
  "primary_goal",
  "secondary_goals",
  "conditions",
  "communication_style",
  "preferred_channel",
  "morning_checkin_time",
  "evening_checkin_time",
  "checkin_enabled",
  "timezone",
  "language",
] as const;

// GET /api/user/profile - Fetch current user's profile
export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { data: profile, error: profileError } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (profileError) {
      logger.error("[API:user/profile] Profile fetch error:", {
        error: profileError.message,
        userId: tenantId,
      });
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error("[API:user/profile] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

// PATCH /api/user/profile - Update current user's profile
export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await request.json();

    // Filter to only allowed fields
    const updates: Partial<UserProfile> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (field in body) {
        // Type-safe assignment
        (updates as Record<string, unknown>)[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: updateError } = await supabase
      .from("exo_tenants")
      .update(updateData)
      .eq("id", tenantId)
      .select()
      .single();

    if (updateError) {
      logger.error("[API:user/profile] Update error:", {
        error: updateError.message,
        userId: tenantId,
        updates: Object.keys(updates),
      });
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 },
      );
    }

    logger.info("[API:user/profile] Profile updated:", {
      userId: tenantId,
      fields: Object.keys(updates),
    });

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error("[API:user/profile] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
