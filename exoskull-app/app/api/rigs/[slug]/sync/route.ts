// =====================================================
// RIG SYNC API - Manual sync trigger + status
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { RigConnection } from "@/lib/rigs/types";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { syncRig } from "@/lib/rigs/rig-syncer";
import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";

const OAUTH_REQUIRED_RIGS = [
  "google",
  "google-fit",
  "google-workspace",
  "google-calendar",
  "microsoft-365",
  "oura",
  "fitbit",
  "facebook",
];

// =====================================================
// POST /api/rigs/[slug]/sync - Trigger manual sync
// =====================================================

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = getServiceSupabase();
  const startTime = Date.now();
  const { slug } = await params;

  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  try {
    // Get connection
    const { data: connection, error: connError } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "Rig not connected", slug },
        { status: 404 },
      );
    }

    // Update status to syncing
    await supabase
      .from("exo_rig_connections")
      .update({ sync_status: "syncing", sync_error: null })
      .eq("id", connection.id);

    // Refresh token if needed
    try {
      const freshToken = await ensureFreshToken(connection);
      if (freshToken !== connection.access_token) {
        connection.access_token = freshToken;
      }
    } catch (tokenError) {
      if (OAUTH_REQUIRED_RIGS.includes(slug)) {
        throw new Error(
          `Token refresh failed for ${slug}: ${(tokenError as Error).message}. User may need to re-authorize.`,
        );
      }
      logger.warn(
        `[Rig Sync] Token refresh skipped for ${slug}:`,
        (tokenError as Error).message,
      );
    }

    // Sync via universal dispatcher
    const syncResult = await syncRig(connection as RigConnection, supabase);

    const duration = Date.now() - startTime;

    // Update connection status
    await supabase
      .from("exo_rig_connections")
      .update({
        sync_status: syncResult.success ? "success" : "error",
        sync_error: syncResult.error || null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    // Log sync result
    await supabase.from("exo_rig_sync_log").insert({
      connection_id: connection.id,
      tenant_id: tenantId,
      rig_slug: slug,
      success: syncResult.success,
      records_synced: syncResult.records,
      error: syncResult.error,
      duration_ms: duration,
      metadata: syncResult.data,
    });

    return NextResponse.json({
      success: syncResult.success,
      slug,
      records_synced: syncResult.records,
      duration_ms: duration,
      data: syncResult.data,
      error: syncResult.error,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = (error as Error).message;

    logger.error(`[Rig Sync] ${slug} failed:`, error);

    await supabase
      .from("exo_rig_connections")
      .update({
        sync_status: "error",
        sync_error: errorMessage,
      })
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug);

    return NextResponse.json(
      {
        success: false,
        slug,
        error: errorMessage,
        duration_ms: duration,
      },
      { status: 500 },
    );
  }
});

// =====================================================
// GET /api/rigs/[slug]/sync - Get sync status
// =====================================================

export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = getServiceSupabase();
  const { slug } = await params;

  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const { data: connection, error: connError } = await supabase
    .from("exo_rig_connections")
    .select("id, sync_status, sync_error, last_sync_at, metadata")
    .eq("tenant_id", tenantId)
    .eq("rig_slug", slug)
    .single();

  if (connError || !connection) {
    return NextResponse.json({ connected: false, slug }, { status: 200 });
  }

  const { data: logs } = await supabase
    .from("exo_rig_sync_log")
    .select("success, records_synced, error, duration_ms, created_at")
    .eq("connection_id", connection.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    connected: true,
    slug,
    sync_status: connection.sync_status,
    sync_error: connection.sync_error,
    last_sync_at: connection.last_sync_at,
    metadata: connection.metadata,
    recent_syncs: logs || [],
  });
});
