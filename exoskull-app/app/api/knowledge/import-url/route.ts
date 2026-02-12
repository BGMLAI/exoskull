/**
 * POST /api/knowledge/import-url
 *
 * Import a web page into the knowledge base.
 * Fetches the URL, extracts text, processes through RAG pipeline.
 *
 * Request: { url: string, category?: string }
 * Response: { success: boolean, documentId?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { importUrl } from "@/lib/knowledge/url-processor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url, category } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    const result = await importUrl(url, user.id, category);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
    });
  } catch (error) {
    console.error("[ImportURL] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Failed to import URL" },
      { status: 500 },
    );
  }
}
