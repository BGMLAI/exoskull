import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  COMPOSIO_TOOLKITS,
  listConnections,
  initiateConnection,
} from "@/lib/integrations/composio-adapter";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/composio — List all Composio toolkits + connection status
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    let connections: Array<{
      id: string;
      toolkit: string;
      status: string;
      createdAt: string;
    }> = [];
    try {
      connections = await listConnections(tenantId);
    } catch (err) {
      logger.error("[ComposioAPI] listConnections failed:", {
        tenantId: tenantId,
        error: err instanceof Error ? err.message : err,
      });
    }

    const connectedSlugs = new Map(
      connections.map((c) => [c.toolkit.toUpperCase(), c]),
    );

    const apps = COMPOSIO_TOOLKITS.map((t) => {
      const conn = connectedSlugs.get(t.slug);
      return {
        slug: t.slug,
        name: t.name,
        description: t.description,
        connected: !!conn,
        connectedAt: conn?.createdAt || null,
      };
    });

    return NextResponse.json({
      apps,
      total: apps.length,
      connected: apps.filter((a) => a.connected).length,
    });
  } catch (error) {
    logger.error("[ComposioAPI] GET error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/integrations/composio — Initiate OAuth connection for a toolkit
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await request.json();
    const { toolkit } = body;

    if (!toolkit || typeof toolkit !== "string") {
      return NextResponse.json(
        { error: "Missing required field: toolkit" },
        { status: 400 },
      );
    }

    const validToolkit = COMPOSIO_TOOLKITS.find(
      (t) => t.slug === toolkit.toUpperCase(),
    );
    if (!validToolkit) {
      return NextResponse.json(
        { error: `Unknown toolkit: ${toolkit}` },
        { status: 400 },
      );
    }

    const { redirectUrl, connectionId } = await initiateConnection(
      tenantId,
      toolkit.toUpperCase(),
    );

    logger.info("[ComposioAPI] Connection initiated:", {
      tenantId: tenantId,
      toolkit: toolkit.toUpperCase(),
      connectionId,
    });

    return NextResponse.json({ redirectUrl, connectionId });
  } catch (error) {
    logger.error("[ComposioAPI] POST error:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 },
    );
  }
}
