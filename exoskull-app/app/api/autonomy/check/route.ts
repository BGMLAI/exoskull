/**
 * Autonomy Check API
 *
 * Check if an action is pre-approved for a user.
 * Used by agents before taking autonomous actions.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// POST - Check if action is granted
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { userId, action, recordError } = body;

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
      console.error("[Autonomy Check] RPC error:", error);
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

    console.log(
      `[Autonomy Check] ${action} for ${userId}: ${isGranted ? "GRANTED" : reason}`,
    );

    return NextResponse.json({
      granted: isGranted,
      action,
      reason: isGranted ? null : reason,
    });
  } catch (error) {
    console.error("[Autonomy Check] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Record error for circuit breaker
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
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
      console.error("[Autonomy Check] Record error RPC failed:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    console.log(
      `[Autonomy Check] Error recorded for ${action}: ${errorMessage}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Autonomy Check] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
