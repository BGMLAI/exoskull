/**
 * Canvas Widget System — Types
 *
 * Per-tenant customizable dashboard widget grid.
 * Maps to `exo_canvas_widgets` table and react-grid-layout layout items.
 */

export type BuiltinWidgetType =
  | "voice_hero"
  | "health"
  | "tasks"
  | "calendar"
  | "conversations"
  | "emotional"
  | "guardian"
  | "quick_actions"
  | "integrations"
  | "email_inbox"
  | "knowledge"
  | "iors_status";

/** Row from exo_canvas_widgets table */
export interface CanvasWidget {
  id: string;
  tenant_id: string;
  widget_type: string; // BuiltinWidgetType | `dynamic_mod:${string}`
  title: string | null;
  mod_slug: string | null;
  position_x: number;
  position_y: number;
  size_w: number;
  size_h: number;
  min_w: number;
  min_h: number;
  config: Record<string, unknown>;
  visible: boolean;
  pinned: boolean;
  sort_order: number;
  created_by: "iors_proposed" | "user_added" | "mod_default" | "system_default";
  created_at: string;
  updated_at: string;
}

/** react-grid-layout layout item */
export interface CanvasLayout {
  i: string; // widget id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean; // pinned widgets
}

/** Widget registry metadata */
export interface WidgetMeta {
  type: string;
  label: string;
  icon: string; // lucide icon name
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  category: "core" | "health" | "productivity" | "iors" | "mod";
}

/** Convert DB row to react-grid-layout item */
export function widgetToLayout(w: CanvasWidget): CanvasLayout {
  return {
    i: w.id,
    x: w.position_x,
    y: w.position_y,
    w: w.size_w,
    h: w.size_h,
    minW: w.min_w,
    minH: w.min_h,
    static: w.pinned,
  };
}
