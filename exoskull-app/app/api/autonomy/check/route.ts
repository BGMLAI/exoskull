/**
 * Autonomy Check API
 *
 * Check if an action is pre-approved for a user.
 * Used by agents before taking autonomous actions.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";

import { withApiLog } from "@/lib/api/request-logger";
/** Constant-time comparison to prevent timing attacks on secrets */
function safeTokenEquals(header: string | null, secret: string): boolean {
  const token = (header ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
export const dynamic = "force-dynamic";

// ============================================================================
// POST - Check if action is granted
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    // Auth: verify caller is the user or a service (CRON)
    const authHeader = request.headers.get("authorization");
    const isCronCall = safeTokenEquals(
      authHeader,
      process.env.CRON_SECRET || "",
    );

    const body = await request.json();
    const { userId, action, recordError } = body;

    if (!isCronCall) {
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;
      if (userId && userId !== auth.tenantId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const supabase = getServiceSupabase();

    if (!userId || !action) {
      return NextResponse.json(
        { error: "userId and action required" },
        { status: 400 },
      );
    }

    // Use database function for check (handles wildcards + updates usage)
    const { data, error } = await supabase.rpc("check_autonomy_grant", {
      p_user_id: userId,
      p_action_pattern: action,
    });

    if (error) {
      logger.error("[Autonomy Check] RPC error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const isGranted = data === true;

    // If not granted, check why
    let reason = "not_granted";
    if (!isGranted) {
      const { data: grant } = await supabase
        .from("user_autonomy_grants")
        .select("is_active, expires_at, daily_limit, use_count, last_used_at")
        .eq("user_id", userId)
        .eq("action_pattern", action)
        .single();

      if (grant) {
        if (!grant.is_active) reason = "disabled";
        else if (grant.expires_at && new Date(grant.expires_at) < new Date())
          reason = "expired";
        else if (grant.daily_limit && grant.use_count >= grant.daily_limit)
          reason = "daily_limit_reached";
      } else {
        reason = "no_matching_grant";
      }
    }

    logger.info(
      `[Autonomy Check] ${action} for ${userId}: ${isGranted ? "GRANTED" : reason}`,
    );

    return NextResponse.json({
      granted: isGranted,
      action,
      reason: isGranted ? null : reason,
    });
  } catch (error) {
    logger.error("[Autonomy Check] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// PATCH - Record error for circuit breaker
// ============================================================================

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    // Auth: verify caller
    const authHeader = request.headers.get("authorization");
    const isCronCall = safeTokenEquals(
      authHeader,
      process.env.CRON_SECRET || "",
    );

    if (!isCronCall) {
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;
    }

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { userId, action, errorMessage } = body;

    if (!userId || !action || !errorMessage) {
      return NextResponse.json(
        { error: "userId, action, and errorMessage required" },
        { status: 400 },
      );
    }

    // Use database function
    const { error } = await supabase.rpc("record_autonomy_error", {
      p_user_id: userId,
      p_action_pattern: action,
      p_error_message: errorMessage,
    });

    if (error) {
      logger.error("[Autonomy Check] Record error RPC failed:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    logger.info(
      `[Autonomy Check] Error recorded for ${action}: ${errorMessage}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Autonomy Check] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
