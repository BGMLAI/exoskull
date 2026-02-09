/**
 * Canvas Widget Defaults
 *
 * Seeds a default widget layout for new tenants.
 * Called from GET /api/canvas/widgets when no widgets exist.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

interface DefaultWidget {
  widget_type: string;
  position_x: number;
  position_y: number;
  size_w: number;
  size_h: number;
  min_w: number;
  min_h: number;
  pinned: boolean;
  sort_order: number;
  created_by: "system_default";
}

const DEFAULT_WIDGETS: DefaultWidget[] = [
  {
    widget_type: "voice_hero",
    position_x: 0,
    position_y: 0,
    size_w: 4,
    size_h: 2,
    min_w: 4,
    min_h: 2,
    pinned: true,
    sort_order: 0,
    created_by: "system_default",
  },
  {
    widget_type: "health",
    position_x: 0,
    position_y: 2,
    size_w: 2,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 1,
    created_by: "system_default",
  },
  {
    widget_type: "tasks",
    position_x: 2,
    position_y: 2,
    size_w: 2,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 2,
    created_by: "system_default",
  },
  {
    widget_type: "optimization",
    position_x: 0,
    position_y: 4,
    size_w: 2,
    size_h: 2,
    min_w: 2,
    min_h: 2,
    pinned: false,
    sort_order: 3,
    created_by: "system_default",
  },
  {
    widget_type: "conversations",
    position_x: 2,
    position_y: 4,
    size_w: 2,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 4,
    created_by: "system_default",
  },
  {
    widget_type: "emotional",
    position_x: 0,
    position_y: 6,
    size_w: 1,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 5,
    created_by: "system_default",
  },
  {
    widget_type: "quick_actions",
    position_x: 1,
    position_y: 6,
    size_w: 1,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 6,
    created_by: "system_default",
  },
  {
    widget_type: "activity_feed",
    position_x: 0,
    position_y: 8,
    size_w: 2,
    size_h: 3,
    min_w: 2,
    min_h: 2,
    pinned: false,
    sort_order: 7,
    created_by: "system_default",
  },
  {
    widget_type: "calendar",
    position_x: 2,
    position_y: 6,
    size_w: 2,
    size_h: 2,
    min_w: 1,
    min_h: 1,
    pinned: false,
    sort_order: 8,
    created_by: "system_default",
  },
];

/** Essential widget types that every user should have */
const ESSENTIAL_TYPES = DEFAULT_WIDGETS.map((w) => w.widget_type);

/**
 * Seed default widgets for a tenant.
 * Uses ON CONFLICT to avoid duplicates (idempotent).
 */
export async function seedDefaultWidgets(tenantId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const rows = DEFAULT_WIDGETS.map((w) => ({
    tenant_id: tenantId,
    ...w,
  }));

  const { error } = await supabase
    .from("exo_canvas_widgets")
    .insert(rows)
    .select("id");

  if (error) {
    // Unique constraint violation = already seeded (race condition safe)
    if (error.code === "23505") return;
    console.error("[Canvas] Failed to seed defaults:", {
      tenantId,
      error: error.message,
    });
  }
}

/**
 * Ensure existing users have all essential widgets.
 * Inserts missing ones at high position_y so they appear below existing layout.
 */
export async function ensureEssentialWidgets(
  tenantId: string,
  existingTypes: string[],
): Promise<number> {
  const missing = DEFAULT_WIDGETS.filter(
    (w) => !existingTypes.includes(w.widget_type),
  );

  if (missing.length === 0) return 0;

  const supabase = getServiceSupabase();

  // Use original default positions from DEFAULT_WIDGETS
  const rows = missing.map((w) => ({
    tenant_id: tenantId,
    ...w,
  }));

  for (const row of rows) {
    const { error } = await supabase.from("exo_canvas_widgets").insert(row);
    if (error && error.code !== "23505") {
      console.error("[Canvas] Failed to insert missing widget:", {
        type: row.widget_type,
        error: error.message,
      });
    }
  }

  return missing.length;
}
