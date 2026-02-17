/**
 * POST /api/claude-code/chat — SSE proxy to VPS agent code endpoint
 *
 * Auth → Rate limit → Admin check → Proxy to VPS → Relay SSE stream
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";
import { createClient } from "@supabase/supabase-js";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VPS_EXECUTOR_URL =
  process.env.VPS_EXECUTOR_URL || "http://57.128.253.15:3500";
const VPS_EXECUTOR_SECRET = process.env.VPS_EXECUTOR_SECRET || "";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function isAdminUser(tenantId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    // 2. Rate limit
    const rateCheck = await checkRateLimit(tenantId, "coding_sessions");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.upgradeMessage || "Coding session limit reached" },
        { status: 429 },
      );
    }

    // 3. Parse body
    const { message, sessionId } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    // 4. Admin check
    const isAdmin = await isAdminUser(tenantId);

    // 5. Proxy to VPS
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 125_000);

    const vpsResponse = await fetch(`${VPS_EXECUTOR_URL}/api/agent/code/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VPS_EXECUTOR_SECRET}`,
      },
      body: JSON.stringify({
        tenantId,
        sessionId,
        message,
        isAdmin,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text().catch(() => "VPS error");
      logger.error("[ClaudeCode] VPS returned error:", {
        status: vpsResponse.status,
        body: errorText.slice(0, 200),
      });
      return NextResponse.json(
        { error: "Agent backend unavailable" },
        { status: 502 },
      );
    }

    if (!vpsResponse.body) {
      return NextResponse.json(
        { error: "No response stream from agent" },
        { status: 502 },
      );
    }

    // Track usage (fire-and-forget)
    incrementUsage(tenantId, "coding_sessions").catch(() => {});

    // 6. Relay SSE stream
    return new Response(vpsResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[ClaudeCode] Chat error:", msg);
    return NextResponse.json(
      { error: "Failed to connect to agent" },
      { status: 500 },
    );
  }
});
