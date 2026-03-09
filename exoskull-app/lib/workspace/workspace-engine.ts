/**
 * Workspace Engine — manages virtual browser sessions on VPS
 *
 * Architecture:
 * - Chrome headless on VPS Docker container
 * - CDP (Chrome DevTools Protocol) for browser control
 * - Screenshots streamed to R2 for client display
 * - Terminal commands executed via VPS executor
 *
 * Phase 1 (POC): Screenshot-based + iframe proxy
 * Phase 2: WebRTC live streaming
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const VPS_URL = process.env.VPS_EXECUTOR_URL || "http://57.128.253.15:3500";
const VPS_SECRET = process.env.VPS_EXECUTOR_SECRET || "";

// ============================================================================
// TYPES
// ============================================================================

export interface WorkspaceSession {
  id: string;
  tenant_id: string;
  status: "active" | "paused" | "ended";
  browser_url: string | null;
  browser_title: string | null;
  browser_screenshot_url: string | null;
  vps_container_id: string | null;
  cdp_endpoint: string | null;
  control_mode: "ai" | "user" | "shared";
  panels: WorkspacePanel[];
  terminal_enabled: boolean;
  terminal_output: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePanel {
  id: string;
  panel_type: string;
  title: string;
  content: string | null;
  url: string | null;
  position: { x: number; y: number; w: number; h: number };
  is_pinned: boolean;
  is_visible: boolean;
}

export interface BrowserAction {
  type:
    | "navigate"
    | "click"
    | "type"
    | "scroll"
    | "screenshot"
    | "evaluate"
    | "back"
    | "forward"
    | "refresh";
  target?: string; // URL for navigate, CSS selector for click/type
  value?: string; // text for type, JS for evaluate
}

export interface BrowserActionResult {
  success: boolean;
  screenshot_url?: string;
  title?: string;
  url?: string;
  content?: string;
  error?: string;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/** Create or resume a workspace session for tenant */
export async function getOrCreateSession(
  tenantId: string,
): Promise<WorkspaceSession> {
  const supabase = getServiceSupabase();

  // Check for existing active session
  const { data: existing } = await supabase
    .from("exo_workspace_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as WorkspaceSession;
  }

  // Create new session
  const { data: session, error } = await supabase
    .from("exo_workspace_sessions")
    .insert({
      tenant_id: tenantId,
      status: "active",
      panels: [],
      control_mode: "ai",
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create workspace session: ${error.message}`);

  logger.info("[Workspace] New session created", {
    sessionId: session.id,
    tenantId,
  });
  return session as WorkspaceSession;
}

/** End a workspace session and cleanup VPS resources */
export async function endSession(sessionId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: session } = await supabase
    .from("exo_workspace_sessions")
    .select("vps_container_id")
    .eq("id", sessionId)
    .single();

  // Cleanup VPS container
  if (session?.vps_container_id) {
    try {
      await vpsRequest("/workspace/destroy", {
        container_id: session.vps_container_id,
      });
    } catch (e) {
      logger.warn("[Workspace] Failed to destroy VPS container", { error: e });
    }
  }

  await supabase
    .from("exo_workspace_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
}

// ============================================================================
// BROWSER CONTROL (via VPS CDP)
// ============================================================================

/** Execute a browser action in the workspace */
export async function executeBrowserAction(
  sessionId: string,
  tenantId: string,
  action: BrowserAction,
): Promise<BrowserActionResult> {
  const supabase = getServiceSupabase();
  const startMs = Date.now();

  try {
    // Ensure VPS container exists
    const session = await ensureContainer(sessionId, tenantId);

    // Execute action on VPS
    const raw = await vpsRequest("/workspace/browser-action", {
      container_id: session.vps_container_id,
      action,
    });
    const result = raw as {
      url?: string;
      title?: string;
      screenshot_url?: string;
      content?: string;
    };

    const duration = Date.now() - startMs;

    // Update session state
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (result.url) updates.browser_url = result.url;
    if (result.title) updates.browser_title = result.title;
    if (result.screenshot_url)
      updates.browser_screenshot_url = result.screenshot_url;

    await supabase
      .from("exo_workspace_sessions")
      .update(updates)
      .eq("id", sessionId);

    // Log action
    await supabase.from("exo_workspace_actions").insert({
      session_id: sessionId,
      tenant_id: tenantId,
      actor: "ai",
      action_type: action.type,
      target: action.target || action.value,
      value: action.value,
      result: result.content?.slice(0, 1000),
      screenshot_url: result.screenshot_url,
      duration_ms: duration,
    });

    logger.info("[Workspace] Browser action executed", {
      action: action.type,
      duration,
      url: result.url,
    });

    return {
      success: true,
      screenshot_url: result.screenshot_url,
      title: result.title,
      url: result.url,
      content: result.content,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[Workspace] Browser action failed", {
      action,
      error: errMsg,
    });

    return { success: false, error: errMsg };
  }
}

/** Execute a terminal command in workspace container */
export async function executeTerminal(
  sessionId: string,
  tenantId: string,
  command: string,
): Promise<{ output: string; exitCode: number }> {
  const supabase = getServiceSupabase();
  const session = await ensureContainer(sessionId, tenantId);

  const raw = await vpsRequest("/workspace/terminal", {
    container_id: session.vps_container_id,
    command,
    timeout_ms: 30_000,
  });
  const result = raw as {
    stdout?: string;
    stderr?: string;
    exit_code?: number;
  };

  const output = result.stdout || result.stderr || "";

  // Update terminal output buffer
  await supabase
    .from("exo_workspace_sessions")
    .update({
      terminal_enabled: true,
      terminal_output: output,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // Log action
  await supabase.from("exo_workspace_actions").insert({
    session_id: sessionId,
    tenant_id: tenantId,
    actor: "ai",
    action_type: "terminal_cmd",
    target: command,
    result: output.slice(0, 2000),
  });

  return {
    output,
    exitCode: result.exit_code || 0,
  };
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

/** Add a panel to the workspace */
export async function addPanel(
  sessionId: string,
  tenantId: string,
  panel: Omit<WorkspacePanel, "id" | "is_pinned" | "is_visible">,
): Promise<WorkspacePanel> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_workspace_panels")
    .insert({
      session_id: sessionId,
      tenant_id: tenantId,
      panel_type: panel.panel_type,
      title: panel.title,
      content: panel.content,
      url: panel.url,
      position: panel.position || { x: 0, y: 0, w: 6, h: 4 },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add panel: ${error.message}`);

  logger.info("[Workspace] Panel added", {
    type: panel.panel_type,
    title: panel.title,
  });
  return data as WorkspacePanel;
}

/** Get all panels for a session */
export async function getPanels(sessionId: string): Promise<WorkspacePanel[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_workspace_panels")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_visible", true)
    .order("created_at", { ascending: true });

  return (data || []) as WorkspacePanel[];
}

/** Remove a panel */
export async function removePanel(panelId: string): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("exo_workspace_panels")
    .update({ is_visible: false })
    .eq("id", panelId);
}

// ============================================================================
// VPS HELPERS
// ============================================================================

/** Ensure a Chrome container exists on VPS for this session */
async function ensureContainer(
  sessionId: string,
  tenantId: string,
): Promise<WorkspaceSession> {
  const supabase = getServiceSupabase();

  const { data: session } = await supabase
    .from("exo_workspace_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Container already running
  if (session.vps_container_id && session.cdp_endpoint) {
    return session as WorkspaceSession;
  }

  // Spin up new Chrome container on VPS
  const raw = await vpsRequest("/workspace/create", {
    session_id: sessionId,
    tenant_id: tenantId,
  });
  const result = raw as { container_id: string; cdp_endpoint: string };

  // Store container info
  await supabase
    .from("exo_workspace_sessions")
    .update({
      vps_container_id: result.container_id,
      cdp_endpoint: result.cdp_endpoint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  session.vps_container_id = result.container_id;
  session.cdp_endpoint = result.cdp_endpoint;

  logger.info("[Workspace] Container created on VPS", {
    containerId: result.container_id,
    sessionId,
  });

  return session as WorkspaceSession;
}

/** Make authenticated request to VPS executor */
async function vpsRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${VPS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VPS_SECRET}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`VPS ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

// ============================================================================
// VPS HEALTH CHECK
// ============================================================================

let vpsStatusCache: { available: boolean; checkedAt: number } | null = null;
const VPS_CACHE_TTL = 5 * 60 * 1000; // 5 min

/** Check if VPS executor is reachable (cached 5 min) */
export async function isVpsAvailable(): Promise<boolean> {
  if (vpsStatusCache && Date.now() - vpsStatusCache.checkedAt < VPS_CACHE_TTL) {
    return vpsStatusCache.available;
  }

  try {
    const res = await fetch(`${VPS_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    const available = res.ok;
    vpsStatusCache = { available, checkedAt: Date.now() };
    return available;
  } catch {
    vpsStatusCache = { available: false, checkedAt: Date.now() };
    return false;
  }
}

// ============================================================================
// SCREENSHOT-BASED FALLBACK (when WebRTC not available)
// ============================================================================

/** Take screenshot of current browser state and return URL */
export async function takeScreenshot(
  sessionId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    const result = await executeBrowserAction(sessionId, tenantId, {
      type: "screenshot",
    });
    return result.screenshot_url || null;
  } catch {
    return null;
  }
}
