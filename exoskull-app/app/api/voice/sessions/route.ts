/**
 * Voice Sessions API
 *
 * Fetches voice session history for the current user.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/voice/sessions
// ============================================================================

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();

    // Fetch user's voice sessions
    const { data: sessions, error } = await supabase
      .from("exo_voice_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      logger.error("[Voice Sessions] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch sessions" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      sessions: sessions || [],
    });
  } catch (error) {
    logger.error("[Voice Sessions] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
