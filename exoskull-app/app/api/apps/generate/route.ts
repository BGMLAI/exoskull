/**
 * POST /api/apps/generate — Generate a new custom app from description
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { generateApp } from "@/lib/apps/generator/app-generator";

import { withApiLog } from "@/lib/api/request-logger";
import { withRateLimit } from "@/lib/api/rate-limit-guard";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(
  withRateLimit("ai_requests", async function POST(request: NextRequest) {
    try {
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;
      const tenantId = auth.tenantId;

      const { description } = await request.json();

      if (
        !description ||
        typeof description !== "string" ||
        description.trim().length < 5
      ) {
        return NextResponse.json(
          { error: "Description must be at least 5 characters" },
          { status: 400 },
        );
      }

      const result = await generateApp({
        tenant_id: tenantId,
        description: description.trim(),
        source: "chat_command",
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({ app: result.app }, { status: 201 });
    } catch (error) {
      logger.error("[AppGenerate] Error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  }),
);
