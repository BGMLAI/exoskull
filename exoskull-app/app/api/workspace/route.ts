/**
 * /api/workspace — Shared Workspace API
 *
 * GET  — Get current workspace session state
 * POST — Execute workspace action (navigate, click, type, terminal, panel)
 * DELETE — End workspace session
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  getOrCreateSession,
  endSession,
  executeBrowserAction,
  executeTerminal,
  addPanel,
  getPanels,
  removePanel,
  takeScreenshot,
} from "@/lib/workspace/workspace-engine";
import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/workspace — get current session state + panels
export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const session = await getOrCreateSession(auth.tenantId);
    const panels = await getPanels(session.id);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        browser_url: session.browser_url,
        browser_title: session.browser_title,
        browser_screenshot_url: session.browser_screenshot_url,
        control_mode: session.control_mode,
        terminal_enabled: session.terminal_enabled,
        terminal_output: session.terminal_output,
      },
      panels,
    });
  } catch (error) {
    logger.error("[Workspace API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get workspace" },
      { status: 500 },
    );
  }
});

// POST /api/workspace — execute workspace action
export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const session = await getOrCreateSession(auth.tenantId);

    switch (action) {
      // Browser actions
      case "navigate":
      case "click":
      case "type":
      case "scroll":
      case "screenshot":
      case "evaluate":
      case "back":
      case "forward":
      case "refresh": {
        const result = await executeBrowserAction(session.id, auth.tenantId, {
          type: action,
          target: body.target,
          value: body.value,
        });
        return NextResponse.json(result);
      }

      // Terminal
      case "terminal": {
        if (!body.command) {
          return NextResponse.json(
            { error: "Missing command" },
            { status: 400 },
          );
        }
        const termResult = await executeTerminal(
          session.id,
          auth.tenantId,
          body.command,
        );
        return NextResponse.json(termResult);
      }

      // Panel management
      case "add_panel": {
        const panel = await addPanel(session.id, auth.tenantId, {
          panel_type: body.panel_type || "custom",
          title: body.title || "Panel",
          content: body.content,
          url: body.url,
          position: body.position || { x: 0, y: 0, w: 6, h: 4 },
        });
        return NextResponse.json(panel);
      }

      case "remove_panel": {
        if (!body.panel_id) {
          return NextResponse.json(
            { error: "Missing panel_id" },
            { status: 400 },
          );
        }
        await removePanel(body.panel_id);
        return NextResponse.json({ success: true });
      }

      // Control mode
      case "set_control": {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        await supabase
          .from("exo_workspace_sessions")
          .update({ control_mode: body.mode || "user" })
          .eq("id", session.id);
        return NextResponse.json({ success: true, mode: body.mode });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[Workspace API] POST error:", error);
    return NextResponse.json(
      { error: "Workspace action failed" },
      { status: 500 },
    );
  }
});

// DELETE /api/workspace — end session
export const DELETE = withApiLog(async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const session = await getOrCreateSession(auth.tenantId);
    await endSession(session.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Workspace API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to end workspace" },
      { status: 500 },
    );
  }
});
