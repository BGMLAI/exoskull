/**
 * Voice Sessions API
 *
 * Fetches voice session history for the current user.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/voice/sessions
// ============================================================================

export async function GET() {
  try {
    // Get authenticated user
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user's voice sessions
    const { data: sessions, error } = await supabase
      .from("exo_voice_sessions")
      .select("*")
      .eq("tenant_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[Voice Sessions] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch sessions" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      sessions: sessions || [],
    });
  } catch (error) {
    console.error("[Voice Sessions] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
