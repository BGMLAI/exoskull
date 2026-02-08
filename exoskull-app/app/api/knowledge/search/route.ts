/**
 * POST /api/knowledge/search — Semantic search over user documents
 *
 * Accepts: { query: string, limit?: number }
 * Returns: { results: [{ content, filename, category, similarity }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchDocuments } from "@/lib/knowledge/document-processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query, limit = 5 } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const results = await searchDocuments(user.id, query, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[KnowledgeSearch] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
