/**
 * POST /api/mods/install - Install a Mod for the current user
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { installMod } from "@/lib/builder/proactive-engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { slug } = await request.json();

    if (!slug) {
      return NextResponse.json(
        { error: "Mod slug is required" },
        { status: 400 },
      );
    }

    const result = await installMod(tenantId, slug);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, slug });
  } catch (error) {
    console.error("[Mods Install] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
