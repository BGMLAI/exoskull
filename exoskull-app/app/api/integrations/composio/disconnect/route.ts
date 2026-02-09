import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listConnections,
  disconnectAccount,
} from "@/lib/integrations/composio-adapter";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/composio/disconnect — Disconnect a Composio toolkit
 */
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
    const { toolkit } = body;

    if (!toolkit || typeof toolkit !== "string") {
      return NextResponse.json(
        { error: "Missing required field: toolkit" },
        { status: 400 },
      );
    }

    const toolkitUpper = toolkit.toUpperCase();

    const connections = await listConnections(user.id);
    const match = connections.find(
      (c) => c.toolkit.toUpperCase() === toolkitUpper,
    );

    if (!match) {
      return NextResponse.json(
        { error: `No active connection found for ${toolkitUpper}` },
        { status: 404 },
      );
    }

    const ok = await disconnectAccount(match.id);

    if (!ok) {
      return NextResponse.json(
        { error: `Failed to disconnect ${toolkitUpper}` },
        { status: 500 },
      );
    }

    logger.info("[ComposioAPI] Disconnected:", {
      tenantId: user.id,
      toolkit: toolkitUpper,
      connectionId: match.id,
    });

    return NextResponse.json({ success: true, toolkit: toolkitUpper });
  } catch (error) {
    logger.error("[ComposioAPI] Disconnect error:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
