// =====================================================
// SEARCH API - Web Search via Tavily
// POST /api/tools/search
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

interface SearchRequest {
  query: string;
  tenant_id: string;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: SearchRequest = await request.json();
    const {
      query,
      tenant_id,
      max_results = 5,
      search_depth = "basic",
      include_answer = true,
      include_domains,
      exclude_domains,
    } = body;

    // Validate required fields
    if (!query) {
      return NextResponse.json(
        { success: false, error: "Missing required field: query" },
        { status: 400 },
      );
    }

    if (!tenant_id) {
      return NextResponse.json(
        { success: false, error: "Missing required field: tenant_id" },
        { status: 400 },
      );
    }

    // Execute search tool
    const result = await executeTool(
      "web_search",
      { tenant_id },
      {
        query,
        max_results,
        search_depth,
        include_answer: include_answer ? "true" : "false",
        include_domains: include_domains?.join(","),
        exclude_domains: exclude_domains?.join(","),
      },
    );

    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      ...result,
      execution_time_ms: executionTime,
    });
  } catch (error) {
    console.error("[API/tools/search] Error:", {
      error: error instanceof Error ? error.message : error,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 },
    );
  }
}

// GET - Quick search with query params
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || searchParams.get("query");
  const tenantId = searchParams.get("tenant_id");

  if (!query) {
    return NextResponse.json(
      { success: false, error: "Missing query parameter: q or query" },
      { status: 400 },
    );
  }

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: "Missing query parameter: tenant_id" },
      { status: 400 },
    );
  }

  const result = await executeTool(
    "web_search",
    { tenant_id: tenantId },
    {
      query,
      max_results: parseInt(searchParams.get("max_results") || "5"),
    },
  );

  return NextResponse.json(result);
}
