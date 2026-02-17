/**
 * FCM Token Registration
 *
 * POST /api/mobile/push/register
 * Body: { token: string, deviceName?: string, platform?: string }
 *
 * Registers an FCM device token for push notifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@supabase/supabase-js";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const POST = withApiLog(async function POST(req: NextRequest) {
  const auth = await verifyTenantAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const body = await req.json();
  const { token, deviceName, platform } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'token'" },
      { status: 400 },
    );
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase.from("exo_device_tokens").upsert(
      {
        tenant_id: tenantId,
        token,
        platform: platform || "android",
        device_name: deviceName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,token" },
    );

    if (error) {
      logger.error("[PushRegister] Failed to register token:", error);
      return NextResponse.json(
        { error: "Failed to register token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[PushRegister] Error:", {
      error: error instanceof Error ? error.message : error,
      userId: tenantId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const DELETE = withApiLog(async function DELETE(req: NextRequest) {
  const auth = await verifyTenantAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const body = await req.json();
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: "Missing 'token'" }, { status: 400 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await supabase
      .from("exo_device_tokens")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("token", token);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[PushRegister] Delete error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
