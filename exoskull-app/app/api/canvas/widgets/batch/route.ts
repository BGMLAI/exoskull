/**
 * Canvas Widget Batch API — Batch layout update
 *
 * PUT /api/canvas/widgets/batch — Update positions/sizes for multiple widgets at once.
 * Called after drag-drop reorder with debounced layout change.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

interface LayoutItem {
  id: string;
  position_x: number;
  position_y: number;
  size_w: number;
  size_h: number;
}

export const PUT = withApiLog(async function PUT(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { layouts } = (await request.json()) as { layouts: LayoutItem[] };

    if (!Array.isArray(layouts) || layouts.length === 0) {
      return NextResponse.json(
        { error: "layouts array is required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    let updated = 0;

    // Update each widget position (non-pinned only)
    for (const item of layouts) {
      const { error } = await supabase
        .from("exo_canvas_widgets")
        .update({
          position_x: item.position_x,
          position_y: item.position_y,
          size_w: item.size_w,
          size_h: item.size_h,
          updated_at: now,
        })
        .eq("id", item.id)
        .eq("tenant_id", tenantId)
        .eq("pinned", false);

      if (!error) updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("[Canvas] Batch PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
