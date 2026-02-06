/**
 * Canvas Widget API — Update & Delete single widget
 *
 * PUT    /api/canvas/widgets/:id — Update position, size, config, visibility
 * DELETE /api/canvas/widgets/:id — Remove widget (blocked for pinned)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ============================================================================
// PUT — Update a single widget
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const widgetId = params.id;
    const body = await request.json();

    // Check if widget exists and belongs to user
    const { data: existing } = await supabase
      .from("exo_canvas_widgets")
      .select("id, pinned")
      .eq("id", widgetId)
      .eq("tenant_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    // Pinned widgets: only allow config changes, not position/visibility
    if (existing.pinned) {
      const allowedFields = ["config", "title"];
      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) updates[field] = body[field];
      }
      updates.updated_at = new Date().toISOString();

      const { data: widget, error } = await supabase
        .from("exo_canvas_widgets")
        .update(updates)
        .eq("id", widgetId)
        .eq("tenant_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("[Canvas] PUT pinned widget failed:", error.message);
        return NextResponse.json(
          { error: "Failed to update widget" },
          { status: 500 },
        );
      }
      return NextResponse.json({ widget });
    }

    // Non-pinned: allow all updates
    const updates: Record<string, unknown> = {};
    const allowed = [
      "position_x",
      "position_y",
      "size_w",
      "size_h",
      "config",
      "visible",
      "title",
      "sort_order",
    ];
    for (const field of allowed) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data: widget, error } = await supabase
      .from("exo_canvas_widgets")
      .update(updates)
      .eq("id", widgetId)
      .eq("tenant_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[Canvas] PUT widget failed:", error.message);
      return NextResponse.json(
        { error: "Failed to update widget" },
        { status: 500 },
      );
    }

    return NextResponse.json({ widget });
  } catch (error) {
    console.error("[Canvas] PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE — Remove a widget
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const widgetId = params.id;

    // Check pinned status
    const { data: existing } = await supabase
      .from("exo_canvas_widgets")
      .select("id, pinned")
      .eq("id", widgetId)
      .eq("tenant_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    if (existing.pinned) {
      return NextResponse.json(
        { error: "Cannot remove pinned widget" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("exo_canvas_widgets")
      .delete()
      .eq("id", widgetId)
      .eq("tenant_id", user.id);

    if (error) {
      console.error("[Canvas] DELETE widget failed:", error.message);
      return NextResponse.json(
        { error: "Failed to remove widget" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Canvas] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
