/**
 * GET /api/ecosystem — Unified ecosystem search API
 *
 * Searches across agents, skills, MCP servers, plugins, commands, and frameworks
 * using the exo_ecosystem_registry table.
 *
 * Query params:
 * - q: search query (matched against name, slug, capabilities)
 * - type: filter by resource_type (agent, skill, mcp, plugin, command, framework)
 * - limit: max results (default: 20, max: 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const params = request.nextUrl.searchParams;
    const q = params.get("q") || "";
    const type = params.get("type");
    const limit = Math.min(Number(params.get("limit")) || 20, 100);

    let query = supabase
      .from("exo_ecosystem_registry")
      .select("*")
      .eq("is_enabled", true)
      .order("resource_type", { ascending: true })
      .limit(limit);

    if (type) {
      query = query.eq("resource_type", type);
    }

    if (q) {
      // Search by name or slug (ilike) or capabilities (contains)
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("[Ecosystem API] Query error:", error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: "DB_ERROR" } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: data || [],
      count: data?.length || 0,
      query: q || undefined,
      type: type || undefined,
    });
  } catch (error) {
    logger.error("[Ecosystem API] Error:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to search ecosystem",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 },
    );
  }
});
