/**
 * System Manifest API — Complete component catalog
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { generateSystemManifest } from "@/lib/system/manifest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const tenantId = req.nextUrl.searchParams.get("tenant_id") || undefined;
    const manifest = await generateSystemManifest(tenantId);

    return NextResponse.json(manifest);
  } catch (error) {
    console.error("[AdminSystemManifest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
