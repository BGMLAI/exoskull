/**
 * Canvas Widgets API — List & Create
 *
 * GET  /api/canvas/widgets — List visible widgets (auto-seeds defaults on first call)
 * POST /api/canvas/widgets — Add a new widget
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  seedDefaultWidgets,
  ensureEssentialWidgets,
} from "@/lib/canvas/defaults";
import type { CanvasWidget } from "@/lib/canvas/types";

export const dynamic = "force-dynamic";

// ============================================================================
// GET — List widgets for current user
// ============================================================================

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch visible widgets
    const { data: widgets, error } = await supabase
      .from("exo_canvas_widgets")
      .select("*")
      .eq("tenant_id", user.id)
      .eq("visible", true)
      .order("sort_order")
      .order("position_y")
      .order("position_x");

    if (error) {
      console.error("[Canvas] GET widgets failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load widgets" },
        { status: 500 },
      );
    }

    // Auto-seed defaults if no widgets exist
    if (!widgets || widgets.length === 0) {
      await seedDefaultWidgets(user.id);

      // Re-fetch after seeding
      const { data: seeded } = await supabase
        .from("exo_canvas_widgets")
        .select("*")
        .eq("tenant_id", user.id)
        .eq("visible", true)
        .order("sort_order")
        .order("position_y")
        .order("position_x");

      return NextResponse.json({ widgets: seeded || [] });
    }

    // Ensure existing users have all essential widgets
    const existingTypes = widgets.map(
      (w: { widget_type: string }) => w.widget_type,
    );
    const added = await ensureEssentialWidgets(user.id, existingTypes);

    if (added > 0) {
      // Re-fetch to include newly added widgets
      const { data: updated } = await supabase
        .from("exo_canvas_widgets")
        .select("*")
        .eq("tenant_id", user.id)
        .eq("visible", true)
        .order("sort_order")
        .order("position_y")
        .order("position_x");

      return NextResponse.json({ widgets: updated || widgets });
    }

    return NextResponse.json({ widgets });
  } catch (error) {
    console.error("[Canvas] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST — Add a new widget
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      widget_type,
      title,
      mod_slug,
      position_x = 0,
      position_y = 100, // auto-place at bottom
      size_w = 2,
      size_h = 2,
      config = {},
    } = body as Partial<CanvasWidget>;

    if (!widget_type) {
      return NextResponse.json(
        { error: "widget_type is required" },
        { status: 400 },
      );
    }

    const { data: widget, error } = await supabase
      .from("exo_canvas_widgets")
      .insert({
        tenant_id: user.id,
        widget_type,
        title: title || null,
        mod_slug: mod_slug || null,
        position_x,
        position_y,
        size_w,
        size_h,
        config,
        created_by: "user_added",
      })
      .select()
      .single();

    if (error) {
      // Duplicate widget type
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Widget of this type already exists" },
          { status: 409 },
        );
      }
      console.error("[Canvas] POST widget failed:", error.message);
      return NextResponse.json(
        { error: "Failed to add widget" },
        { status: 500 },
      );
    }

    return NextResponse.json({ widget }, { status: 201 });
  } catch (error) {
    console.error("[Canvas] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
