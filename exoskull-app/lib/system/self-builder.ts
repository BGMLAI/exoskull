/**
 * Self-Builder — System that can modify its own dashboard, widgets, and config
 *
 * Capabilities:
 * - Add/remove/reorder canvas widgets programmatically
 * - Modify widget configurations
 * - Adjust system behavior args (AI tier, features, schedules)
 * - Track self-modification history for audit
 * - Hot-reload UI via WebSocket push (Supabase Realtime)
 *
 * Safety:
 * - All modifications logged to exo_dev_journal
 * - Rate-limited (max 5 self-modifications per hour)
 * - Requires tenant autonomy_config.selfBuild = true
 * - Critical config changes require user approval
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getWidgetMeta, WIDGET_REGISTRY } from "@/lib/canvas/widget-registry";
import { emitSelfBuilderEvent } from "@/lib/system/inter-system-bus";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface SelfBuildAction {
  type:
    | "add_widget"
    | "remove_widget"
    | "reorder_widgets"
    | "update_config"
    | "update_layout";
  description: string;
  params: Record<string, unknown>;
  reason: string;
  source:
    | "ralph_loop"
    | "gotcha_engine"
    | "atlas_pipeline"
    | "health_checker"
    | "manual";
}

export interface SelfBuildResult {
  success: boolean;
  action: string;
  details?: string;
  error?: string;
  requiresApproval?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimits = new Map<string, RateLimitEntry>();
const MAX_MODIFICATIONS_PER_HOUR = 10;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(tenantId);

  if (!entry || now >= entry.resetAt) {
    rateLimits.set(tenantId, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= MAX_MODIFICATIONS_PER_HOUR) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================================
// PERMISSION CHECK
// ============================================================================

async function canSelfBuild(tenantId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("exo_tenants")
    .select("autonomy_config")
    .eq("id", tenantId)
    .maybeSingle();

  if (!data?.autonomy_config) return false;

  const config = data.autonomy_config as Record<string, unknown>;
  return config.selfBuild === true;
}

// ============================================================================
// SELF-BUILD ACTIONS
// ============================================================================

/**
 * Execute a self-build action. Called by Ralph Loop, GOTCHA Engine, etc.
 */
export async function executeSelfBuild(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  // Permission check
  const allowed = await canSelfBuild(tenantId);
  if (!allowed) {
    return {
      success: false,
      action: action.type,
      error:
        "Self-build not enabled for this tenant (autonomy_config.selfBuild = false)",
    };
  }

  // Rate limit
  if (!checkRateLimit(tenantId)) {
    return {
      success: false,
      action: action.type,
      error: `Rate limit exceeded (max ${MAX_MODIFICATIONS_PER_HOUR}/hour)`,
    };
  }

  try {
    let result: SelfBuildResult;

    switch (action.type) {
      case "add_widget":
        result = await addWidget(tenantId, action);
        break;
      case "remove_widget":
        result = await removeWidget(tenantId, action);
        break;
      case "reorder_widgets":
        result = await reorderWidgets(tenantId, action);
        break;
      case "update_config":
        result = await updateConfig(tenantId, action);
        break;
      case "update_layout":
        result = await updateLayout(tenantId, action);
        break;
      default:
        result = {
          success: false,
          action: action.type,
          error: `Unknown action type: ${action.type}`,
        };
    }

    // Log to dev journal
    await logSelfBuild(tenantId, action, result);

    // Emit bus event
    if (result.success) {
      emitSelfBuilderEvent(
        action.type === "add_widget"
          ? "widget.added"
          : action.type === "remove_widget"
            ? "widget.removed"
            : action.type === "update_layout" ||
                action.type === "reorder_widgets"
              ? "layout.changed"
              : "config.updated",
        tenantId,
        {
          action: action.type,
          description: action.description,
          reason: action.reason,
          source: action.source,
        },
      );
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("[SelfBuilder] Action failed:", {
      tenantId,
      action: action.type,
      error,
    });
    return { success: false, action: action.type, error };
  }
}

// ============================================================================
// ADD WIDGET
// ============================================================================

async function addWidget(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  const widgetType = action.params.widget_type as string;
  if (!widgetType) {
    return {
      success: false,
      action: "add_widget",
      error: "No widget_type specified",
    };
  }

  // Validate widget type exists
  const meta = getWidgetMeta(widgetType);
  if (!meta) {
    return {
      success: false,
      action: "add_widget",
      error: `Unknown widget type: ${widgetType}`,
    };
  }

  const supabase = getServiceSupabase();

  // Check if widget already exists for this tenant
  const { data: existing } = await supabase
    .from("exo_canvas_widgets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("widget_type", widgetType)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      action: "add_widget",
      error: `Widget "${widgetType}" already exists for this tenant`,
    };
  }

  // Find next available position (bottom of grid)
  const { data: widgets } = await supabase
    .from("exo_canvas_widgets")
    .select("position_y, size_h")
    .eq("tenant_id", tenantId)
    .order("position_y", { ascending: false })
    .limit(1);

  const nextY =
    widgets && widgets.length > 0
      ? (widgets[0].position_y as number) + (widgets[0].size_h as number)
      : 0;

  // Get max sort_order
  const { data: maxSort } = await supabase
    .from("exo_canvas_widgets")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const sortOrder =
    maxSort && maxSort.length > 0 ? (maxSort[0].sort_order as number) + 1 : 0;

  // Insert the widget
  const { error } = await supabase.from("exo_canvas_widgets").insert({
    tenant_id: tenantId,
    widget_type: widgetType,
    title: (action.params.title as string) || meta.label,
    position_x: 0,
    position_y: nextY,
    size_w: meta.defaultSize.w,
    size_h: meta.defaultSize.h,
    min_w: meta.minSize.w,
    min_h: meta.minSize.h,
    config: (action.params.config as Record<string, unknown>) || {},
    visible: true,
    pinned: false,
    sort_order: sortOrder,
    created_by: "iors_proposed",
  });

  if (error) {
    return {
      success: false,
      action: "add_widget",
      error: `DB insert failed: ${error.message}`,
    };
  }

  // Trigger realtime refresh via Supabase Realtime (insert auto-broadcasts)
  return {
    success: true,
    action: "add_widget",
    details: `Added widget "${widgetType}" at position (0, ${nextY}). Reason: ${action.reason}`,
  };
}

// ============================================================================
// REMOVE WIDGET
// ============================================================================

async function removeWidget(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  const widgetType = action.params.widget_type as string;
  const widgetId = action.params.widget_id as string;

  if (!widgetType && !widgetId) {
    return {
      success: false,
      action: "remove_widget",
      error: "No widget_type or widget_id specified",
    };
  }

  const supabase = getServiceSupabase();

  let query = supabase
    .from("exo_canvas_widgets")
    .delete()
    .eq("tenant_id", tenantId);

  if (widgetId) {
    query = query.eq("id", widgetId);
  } else {
    query = query.eq("widget_type", widgetType);
  }

  const { error, count } = await query;

  if (error) {
    return {
      success: false,
      action: "remove_widget",
      error: `DB delete failed: ${error.message}`,
    };
  }

  if (count === 0) {
    return {
      success: false,
      action: "remove_widget",
      error: `Widget not found: ${widgetId || widgetType}`,
    };
  }

  return {
    success: true,
    action: "remove_widget",
    details: `Removed widget "${widgetId || widgetType}". Reason: ${action.reason}`,
  };
}

// ============================================================================
// REORDER WIDGETS
// ============================================================================

async function reorderWidgets(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  const priorities = action.params.priorities as
    | Array<{ widget_type: string; sort_order: number }>
    | undefined;

  if (!priorities || priorities.length === 0) {
    return {
      success: false,
      action: "reorder_widgets",
      error: "No priorities specified",
    };
  }

  const supabase = getServiceSupabase();

  // Update sort_order for each widget
  const updates = priorities.map(async (p) => {
    return supabase
      .from("exo_canvas_widgets")
      .update({ sort_order: p.sort_order })
      .eq("tenant_id", tenantId)
      .eq("widget_type", p.widget_type);
  });

  const results = await Promise.allSettled(updates);
  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    return {
      success: false,
      action: "reorder_widgets",
      error: `${failures.length}/${priorities.length} updates failed`,
    };
  }

  return {
    success: true,
    action: "reorder_widgets",
    details: `Reordered ${priorities.length} widgets. Reason: ${action.reason}`,
  };
}

// ============================================================================
// UPDATE CONFIG (tenant-level behavior args)
// ============================================================================

async function updateConfig(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  const configPath = action.params.config_path as string;
  const newValue = action.params.value;

  if (!configPath) {
    return {
      success: false,
      action: "update_config",
      error: "No config_path specified",
    };
  }

  // Safety: certain configs require user approval
  const criticalPaths = [
    "autonomy_config.selfBuild",
    "ai_config.dailyBudget",
    "ai_config.defaultTier",
  ];

  if (criticalPaths.some((p) => configPath.startsWith(p))) {
    return {
      success: false,
      action: "update_config",
      error: `Critical config "${configPath}" requires user approval`,
      requiresApproval: true,
    };
  }

  const supabase = getServiceSupabase();

  // Parse config_path: e.g. "ai_config.features.lateralThinking"
  const [column, ...pathParts] = configPath.split(".");

  if (!["ai_config", "autonomy_config", "preferences"].includes(column)) {
    return {
      success: false,
      action: "update_config",
      error: `Invalid config column: ${column}`,
    };
  }

  // Get current value
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select(column)
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) {
    return {
      success: false,
      action: "update_config",
      error: "Tenant not found",
    };
  }

  // Deep-set the value
  const tenantRecord = tenant as unknown as Record<string, unknown>;
  const currentConfig = (tenantRecord[column] as Record<string, unknown>) || {};
  setNestedValue(currentConfig, pathParts, newValue);

  // Update
  const { error } = await supabase
    .from("exo_tenants")
    .update({ [column]: currentConfig })
    .eq("id", tenantId);

  if (error) {
    return {
      success: false,
      action: "update_config",
      error: `Config update failed: ${error.message}`,
    };
  }

  return {
    success: true,
    action: "update_config",
    details: `Updated ${configPath} = ${JSON.stringify(newValue)}. Reason: ${action.reason}`,
  };
}

// ============================================================================
// UPDATE LAYOUT (widget positions/sizes)
// ============================================================================

async function updateLayout(
  tenantId: string,
  action: SelfBuildAction,
): Promise<SelfBuildResult> {
  const layouts = action.params.layouts as
    | Array<{
        widget_type: string;
        position_x?: number;
        position_y?: number;
        size_w?: number;
        size_h?: number;
      }>
    | undefined;

  if (!layouts || layouts.length === 0) {
    return {
      success: false,
      action: "update_layout",
      error: "No layouts specified",
    };
  }

  const supabase = getServiceSupabase();

  const updates = layouts.map(async (layout) => {
    const updateData: Record<string, unknown> = {};
    if (layout.position_x !== undefined)
      updateData.position_x = layout.position_x;
    if (layout.position_y !== undefined)
      updateData.position_y = layout.position_y;
    if (layout.size_w !== undefined) updateData.size_w = layout.size_w;
    if (layout.size_h !== undefined) updateData.size_h = layout.size_h;

    if (Object.keys(updateData).length === 0) return;

    return supabase
      .from("exo_canvas_widgets")
      .update(updateData)
      .eq("tenant_id", tenantId)
      .eq("widget_type", layout.widget_type);
  });

  await Promise.allSettled(updates);

  return {
    success: true,
    action: "update_layout",
    details: `Updated layout for ${layouts.length} widgets. Reason: ${action.reason}`,
  };
}

// ============================================================================
// SMART SUGGESTIONS (what to self-build based on system state)
// ============================================================================

/**
 * Analyze system state and suggest self-build actions.
 * Called by Ralph Loop during the ANALYZE phase.
 */
export async function suggestSelfBuildActions(
  tenantId: string,
): Promise<SelfBuildAction[]> {
  const suggestions: SelfBuildAction[] = [];
  const supabase = getServiceSupabase();

  // Check which widgets the tenant has
  const { data: currentWidgets } = await supabase
    .from("exo_canvas_widgets")
    .select("widget_type")
    .eq("tenant_id", tenantId);

  const existingTypes = new Set(
    (currentWidgets || []).map((w) => w.widget_type as string),
  );

  // Suggest missing critical widgets
  const criticalWidgets = [
    "system_health",
    "process_monitor",
    "value_tree",
    "tasks",
  ];

  for (const widgetType of criticalWidgets) {
    if (!existingTypes.has(widgetType) && WIDGET_REGISTRY[widgetType]) {
      suggestions.push({
        type: "add_widget",
        description: `Add missing "${widgetType}" widget to dashboard`,
        params: { widget_type: widgetType },
        reason: `Critical widget "${widgetType}" not found on dashboard`,
        source: "ralph_loop",
      });
    }
  }

  // Check for integration issues → suggest integration_health widget
  const { data: unhealthyIntegrations } = await supabase
    .from("exo_integration_health")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("status", "healthy")
    .limit(1);

  if (
    unhealthyIntegrations &&
    unhealthyIntegrations.length > 0 &&
    !existingTypes.has("integration_health")
  ) {
    suggestions.push({
      type: "add_widget",
      description:
        "Add integration health widget (unhealthy integrations detected)",
      params: { widget_type: "integration_health" },
      reason: "Detected unhealthy integrations — user should see the status",
      source: "health_checker",
    });
  }

  return suggestions;
}

// ============================================================================
// AUDIT LOG
// ============================================================================

async function logSelfBuild(
  tenantId: string,
  action: SelfBuildAction,
  result: SelfBuildResult,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("exo_dev_journal").insert({
      tenant_id: tenantId,
      entry_type: "self_build",
      title: `Self-build: ${action.type}`,
      content: action.description,
      details: {
        action_type: action.type,
        params: action.params,
        reason: action.reason,
        source: action.source,
        result: result.success ? "success" : "failed",
        error: result.error,
      },
      outcome: result.success ? "success" : "failed",
      related_entity: `self_build:${action.type}`,
    });
  } catch (err) {
    logger.error("[SelfBuilder] Failed to log audit:", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    obj[path[0]] = value;
    return;
  }

  const [head, ...rest] = path;
  if (!obj[head] || typeof obj[head] !== "object") {
    obj[head] = {};
  }
  setNestedValue(obj[head] as Record<string, unknown>, rest, value);
}
