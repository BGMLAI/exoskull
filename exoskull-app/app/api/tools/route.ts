// =====================================================
// TOOLS API - Main Dispatcher
// POST /api/tools - Execute a tool
// GET /api/tools - List available tools
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import {
  executeTool,
  getAllToolDefinitions,
  getToolManifest,
  ToolExecutionRequest,
} from "@/lib/tools";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// =====================================================
// GET - List available tools
// =====================================================

export const GET = withApiLog(async function GET() {
  try {
    const tools = getAllToolDefinitions();
    const manifest = getToolManifest();

    return NextResponse.json({
      success: true,
      tools,
      manifest,
      count: tools.length,
    });
  } catch (error) {
    logger.error("[API/tools] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get tools" },
      { status: 500 },
    );
  }
});

// =====================================================
// POST - Execute a tool
// =====================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: ToolExecutionRequest = await request.json();
    const { tool, tenant_id, params, conversation_id } = body;

    // Validate required fields
    if (!tool) {
      return NextResponse.json(
        { success: false, error: "Missing required field: tool" },
        { status: 400 },
      );
    }

    if (!tenant_id) {
      return NextResponse.json(
        { success: false, error: "Missing required field: tenant_id" },
        { status: 400 },
      );
    }

    // Execute the tool
    const result = await executeTool(
      tool,
      { tenant_id, conversation_id },
      params || {},
    );

    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      ...result,
      tool,
      execution_time_ms: executionTime,
    });
  } catch (error) {
    logger.error("[API/tools] POST error:", {
      error: error instanceof Error ? error.message : error,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 },
    );
  }
});
