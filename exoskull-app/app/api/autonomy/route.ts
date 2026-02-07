/**
 * Autonomy Grants API
 *
 * Manage pre-approved action patterns for autonomous operations.
 * Supports wildcards (e.g., "send_sms:*") and circuit breaker.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

async function getAuthUser() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ============================================================================
// GET - List user's autonomy grants
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from("user_autonomy_grants")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Autonomy] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Group by category
    const byCategory: Record<string, typeof data> = {};
    for (const grant of data || []) {
      const cat = grant.category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(grant);
    }

    return NextResponse.json({
      grants: data,
      byCategory,
      total: data?.length || 0,
    });
  } catch (error) {
    console.error("[Autonomy] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch autonomy grants" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST - Create new autonomy grant
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { actionPattern, category, expiresAt, spendingLimit, dailyLimit } =
      body;

    const userId = user.id;

    if (!actionPattern) {
      return NextResponse.json(
        { error: "actionPattern required" },
        { status: 400 },
      );
    }

    // Validate action pattern format
    if (!isValidPattern(actionPattern)) {
      return NextResponse.json(
        {
          error:
            "Invalid action pattern. Use format: action or action:scope or action:*",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_autonomy_grants")
      .insert({
        user_id: userId,
        action_pattern: actionPattern,
        category: category || inferCategory(actionPattern),
        expires_at: expiresAt || null,
        spending_limit: spendingLimit || null,
        daily_limit: dailyLimit || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Grant already exists for this pattern" },
          { status: 409 },
        );
      }
      console.error("[Autonomy] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    logger.info(
      `[Autonomy] Grant created: ${actionPattern} for user ${userId}`,
    );

    return NextResponse.json({
      success: true,
      grant: data,
    });
  } catch (error) {
    console.error("[Autonomy] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create autonomy grant" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Update grant (toggle active, update limits)
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { grantId, isActive, spendingLimit, dailyLimit, expiresAt } = body;

    if (!grantId) {
      return NextResponse.json({ error: "grantId required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof isActive === "boolean") updates.is_active = isActive;
    if (spendingLimit !== undefined) updates.spending_limit = spendingLimit;
    if (dailyLimit !== undefined) updates.daily_limit = dailyLimit;
    if (expiresAt !== undefined) updates.expires_at = expiresAt;

    const { data, error } = await supabase
      .from("user_autonomy_grants")
      .update(updates)
      .eq("id", grantId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[Autonomy] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      grant: data,
    });
  } catch (error) {
    console.error("[Autonomy] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update autonomy grant" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE - Revoke grant
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const grantId = searchParams.get("grantId");

    if (!grantId) {
      return NextResponse.json({ error: "grantId required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_autonomy_grants")
      .delete()
      .eq("id", grantId)
      .eq("user_id", userId);

    if (error) {
      console.error("[Autonomy] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    logger.info(`[Autonomy] Grant revoked: ${grantId} for user ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Autonomy] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to revoke autonomy grant" },
      { status: 500 },
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function isValidPattern(pattern: string): boolean {
  // Valid patterns: "action", "action:scope", "action:*", "*"
  const validPatternRegex = /^(\*|[a-z_]+(?::[a-z_*]+)?)$/i;
  return validPatternRegex.test(pattern);
}

function inferCategory(pattern: string): string {
  const action = pattern.split(":")[0].toLowerCase();

  const categoryMap: Record<string, string> = {
    send_sms: "communication",
    send_email: "communication",
    make_call: "communication",
    create_task: "tasks",
    complete_task: "tasks",
    update_task: "tasks",
    schedule_event: "calendar",
    cancel_event: "calendar",
    log_health: "health",
    log_meal: "health",
    log_mood: "health",
    transfer_money: "finance",
    pay_bill: "finance",
    control_lights: "smart_home",
    set_temperature: "smart_home",
  };

  return categoryMap[action] || "other";
}
