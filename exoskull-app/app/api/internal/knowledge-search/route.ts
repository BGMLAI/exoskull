/**
 * POST /api/internal/knowledge-search
 *
 * Service-to-service endpoint for VPS agent to search user knowledge base.
 * Auth: Bearer VPS_AGENT_SECRET (not user JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import { searchDocuments } from "@/lib/knowledge/document-processor";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.VPS_AGENT_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tenantId, query, limit } = await request.json();

    if (!tenantId || !query) {
      return NextResponse.json(
        { error: "tenantId and query are required" },
        { status: 400 },
      );
    }

    const results = await searchDocuments(tenantId, query, limit || 5);

    return NextResponse.json({ results });
  } catch (error) {
    logger.error("[InternalKnowledgeSearch] Failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
