/**
 * IORS Profile API — For IORSStatusWidget
 *
 * GET /api/canvas/iors-profile — Returns IORS personality, birth status,
 * active permissions count, and latest emotion signal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    // Fetch IORS data from tenant
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select(
        "iors_name, iors_personality, iors_birth_date, iors_birth_completed, iors_birth_enabled",
      )
      .eq("id", tenantId)
      .single();

    // Count active permissions
    const { count: activePermissions } = await supabase
      .from("exo_autonomy_permissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("granted", true)
      .is("revoked_at", null);

    // Latest emotion signal
    const { data: lastEmotion } = await supabase
      .from("exo_emotion_signals")
      .select("quadrant, label, valence, arousal, created_at")
      .eq("tenant_id", tenantId)
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
    logger.error("[Canvas] IORS profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
