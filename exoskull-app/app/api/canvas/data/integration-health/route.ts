/**
 * GET /api/canvas/data/integration-health
 *
 * Returns integration health summary for the authenticated tenant.
 * Data source: exo_integration_health table + get_integration_health_summary RPC.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export interface IntegrationHealthItem {
  integration_type: string;
  status: "healthy" | "degraded" | "down";
  circuit_state: "closed" | "open" | "half_open";
  consecutive_failures: number;
  error_count_24h: number;
  last_check_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
}

export const GET = withApiLog(async function GET(request: NextRequest) {
  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const supabase = getServiceSupabase();

  try {
    // Try RPC first (more efficient)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_integration_health_summary",
      { p_tenant_id: tenantId },
    );

    if (!rpcError && rpcData) {
      return NextResponse.json({
        integrations: rpcData as IntegrationHealthItem[],
      });
    }

    // Fallback: Direct table query
    const { data, error } = await supabase
      .from("exo_integration_health")
      .select(
        "integration_type, status, circuit_state, consecutive_failures, error_count_24h, last_check_at, last_success_at, last_error_message",
      )
      .eq("tenant_id", tenantId)
      .order("integration_type");

    if (error) {
      logger.error("[IntegrationHealth:API] Query failed:", {
        tenantId: tenantId.slice(0, 8),
        error: error.message,
      });
      return NextResponse.json({ integrations: [] });
    }

    return NextResponse.json({
      integrations: (data || []) as IntegrationHealthItem[],
    });
  } catch (err) {
    logger.error("[IntegrationHealth:API] Unexpected error:", {
      tenantId: tenantId.slice(0, 8),
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json({ integrations: [] });
  }
});
