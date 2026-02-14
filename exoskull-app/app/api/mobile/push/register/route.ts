/**
 * FCM Token Registration
 *
 * POST /api/mobile/push/register
 * Body: { token: string, deviceName?: string, platform?: string }
 *
 * Registers an FCM device token for push notifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function authenticateRequest(
  req: NextRequest,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { userId: user.id };
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        tenant_id: auth.userId,
        token,
        platform: platform || "android",
        device_name: deviceName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,token" },
    );

    if (error) {
      console.error("[PushRegister] Failed to register token:", error);
      return NextResponse.json(
        { error: "Failed to register token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PushRegister] Error:", {
      error: error instanceof Error ? error.message : error,
      userId: auth.userId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      .eq("tenant_id", auth.userId)
      .eq("token", token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PushRegister] Delete error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
