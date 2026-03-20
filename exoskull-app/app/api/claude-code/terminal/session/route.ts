/**
 * POST /api/claude-code/terminal/session
 *
 * Creates a terminal session on the VPS and returns connection details.
 * Auth: tenant session cookie (same as other claude-code routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@supabase/supabase-js";
import { withApiLog } from "@/lib/api/request-logger";
import { withRateLimit } from "@/lib/api/rate-limit-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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

export const POST = withApiLog(
  withRateLimit("coding_sessions", async function POST(request: NextRequest) {
    try {
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;

      const tenantId = auth.tenantId;
      const isAdmin = await isAdminUser(tenantId);

      // Proxy to VPS terminal session endpoint
      const res = await fetch(`${VPS_EXECUTOR_URL}/api/terminal/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${VPS_EXECUTOR_SECRET}`,
        },
        body: JSON.stringify({ tenantId, isAdmin }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: err.error || `VPS error (${res.status})` },
          { status: res.status },
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("[Terminal] Session creation error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }),
);
