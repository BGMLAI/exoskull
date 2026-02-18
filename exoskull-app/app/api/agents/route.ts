import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/agents — List agents with optional filters.
 *
 * Query params:
 * - slug: lookup a single agent by slug
 * - type: filter by type (core, specialized, personal, business, creative)
 * - parent_id: filter by parent_agent_id (get sub-agents)
 * - include_personalities: "true" to include personality vault agents
 * - limit: max results (default: 50, max: 200)
 */
export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const params = request.nextUrl.searchParams;
    const slug = params.get("slug");
    const type = params.get("type");
    const parentId = params.get("parent_id");
    const includePersonalities = params.get("include_personalities") === "true";
    const limit = Math.min(Number(params.get("limit")) || 50, 200);

    // Single agent lookup by slug
    if (slug) {
      const { data, error } = await supabase
        .from("exo_agents")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error || !data) {
        return NextResponse.json(
          {
            data: null,
            error: { message: "Agent not found", code: "NOT_FOUND" },
          },
          { status: 404 },
        );
      }
      return NextResponse.json({ data, error: null });
    }

    // List query
    let query = supabase
      .from("exo_agents")
      .select(
        "id, name, slug, type, tier, description, capabilities, is_global, active, depth, parent_agent_id, auto_generated, personality_config, created_at",
      )
      .eq("active", true)
      .order("tier", { ascending: true })
      .limit(limit);

    // By default, show global agents + personality vault
    if (!includePersonalities) {
      query = query.eq("is_global", true);
    }

    if (type) query = query.eq("type", type);
    if (parentId) query = query.eq("parent_agent_id", parentId);

    const { data, error } = await query;

    if (error) {
      logger.error("[Agents] DB query error:", error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: "DB_ERROR" } },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (error) {
    logger.error("[Agents] DB query error:", error);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Failed to fetch agents", code: "DB_ERROR" },
      },
      { status: 500 },
    );
  }
});
