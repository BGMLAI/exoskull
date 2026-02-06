/**
 * IORS Profile API — For IORSStatusWidget
 *
 * GET /api/canvas/iors-profile — Returns IORS personality, birth status,
 * active permissions count, and latest emotion signal.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch IORS data from tenant
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select(
        "iors_name, iors_personality, iors_birth_date, iors_birth_completed, iors_birth_enabled",
      )
      .eq("id", user.id)
      .single();

    // Count active permissions
    const { count: activePermissions } = await supabase
      .from("exo_autonomy_permissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", user.id)
      .eq("granted", true)
      .is("revoked_at", null);

    // Latest emotion signal
    const { data: lastEmotion } = await supabase
      .from("exo_emotion_signals")
      .select("quadrant, label, valence, arousal, created_at")
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      name: tenant?.iors_name || "IORS",
      personality: tenant?.iors_personality || null,
      birthDate: tenant?.iors_birth_date || null,
      birthCompleted: tenant?.iors_birth_completed ?? false,
      birthEnabled: tenant?.iors_birth_enabled ?? true,
      activePermissions: activePermissions || 0,
      lastEmotion: lastEmotion || null,
    });
  } catch (error) {
    console.error("[Canvas] IORS profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
