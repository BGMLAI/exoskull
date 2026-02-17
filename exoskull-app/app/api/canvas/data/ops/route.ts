/**
 * Canvas Ops Data API
 *
 * GET /api/canvas/data/ops — Returns ops for a given challenge or quest.
 *
 * Query params:
 *   ?challengeId=uuid  — Ops belonging to a specific challenge
 *   ?questId=uuid      — Ops belonging to a specific quest
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const challengeId = searchParams.get("challengeId");
    const questId = searchParams.get("questId");

    if (!challengeId && !questId) {
      return NextResponse.json(
        { error: "challengeId or questId required" },
        { status: 400 },
      );
    }

    let query = supabase
      .from("user_ops")
      .select("id, title, status, priority, due_date, description")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "active", "blocked"])
      .order("priority", { ascending: false })
      .limit(20);

    if (challengeId) {
      query = query.eq("challenge_id", challengeId);
    } else if (questId) {
      query = query.eq("quest_id", questId);
    }

    const { data: ops, error } = await query;

    if (error) {
      console.error("[CanvasOps] Query error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ops: ops || [] });
  } catch (error) {
    console.error("[CanvasOps] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
