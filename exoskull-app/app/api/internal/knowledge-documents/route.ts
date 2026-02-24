/**
 * GET /api/internal/knowledge-documents?tenantId=xxx
 *
 * Service-to-service endpoint for VPS agent to list user documents.
 * Auth: Bearer VPS_AGENT_SECRET (not user JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.VPS_AGENT_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenantId is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("exo_user_documents")
      .select("id, filename, category, file_size, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    logger.error("[InternalKnowledgeDocuments] Failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 },
    );
  }
}
