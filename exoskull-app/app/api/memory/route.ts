/**
 * GET /api/memory?type=timeline|search|highlights
 *
 * Unified memory API endpoint:
 *   ?type=timeline&page=1&pageSize=10 — paginated daily summaries
 *   ?type=search&q=keyword&limit=20   — keyword search
 *   ?type=highlights&limit=20         — user memory highlights
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemoryTimeline, keywordSearch } from "@/lib/memory/search";
import { getUserHighlights } from "@/lib/memory/highlights";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "timeline";

    switch (type) {
      case "timeline": {
        const page = parseInt(url.searchParams.get("page") || "1");
        const pageSize = parseInt(url.searchParams.get("pageSize") || "10");
        const result = await getMemoryTimeline(user.id, page, pageSize);
        return NextResponse.json(result);
      }

      case "search": {
        const q = url.searchParams.get("q");
        if (!q) {
          return NextResponse.json(
            { error: "Query parameter 'q' is required" },
            { status: 400 },
          );
        }
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const results = await keywordSearch({
          tenantId: user.id,
          query: q,
          limit,
        });
        return NextResponse.json({ results });
      }

      case "highlights": {
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const highlights = await getUserHighlights(supabase, user.id, limit);
        return NextResponse.json({ highlights });
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[Memory API] Error:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
