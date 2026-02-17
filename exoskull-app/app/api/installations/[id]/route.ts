import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// GET /api/installations/[id] - Get single installation details
export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { data: installation, error } = await supabase
      .from("exo_user_installations")
      .select(
        `
        *,
        registry:exo_registry(*)
      `,
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !installation) {
      return NextResponse.json(
        { error: "Installation not found" },
        { status: 404 },
      );
    }

    // Get connection if it's a rig
    let connection = null;
    if (installation.registry?.type === "rig") {
      const { data: conn } = await supabase
        .from("exo_rig_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("rig_slug", installation.registry.slug)
        .single();

      connection = conn;
    }

    return NextResponse.json({
      installation,
      connection,
    });
  } catch (error) {
    logger.error("[Installations] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

// PATCH /api/installations/[id] - Update installation config
export const PATCH = withApiLog(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await request.json();
    const { config, enabled } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (config !== undefined) {
      updates.config = config;
    }

    if (enabled !== undefined) {
      updates.enabled = enabled;
    }

    const { data: installation, error } = await supabase
      .from("exo_user_installations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      logger.error("[Installations] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update installation" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      installation,
    });
  } catch (error) {
    logger.error("[Installations] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

// DELETE /api/installations/[id] - Uninstall
export const DELETE = withApiLog(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    // Get installation to check type
    const { data: installation } = await supabase
      .from("exo_user_installations")
      .select("*, registry:exo_registry(slug, type, name)")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!installation) {
      return NextResponse.json(
        { error: "Installation not found" },
        { status: 404 },
      );
    }

    // Delete installation
    const { error } = await supabase
      .from("exo_user_installations")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      logger.error("[Installations] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to uninstall" },
        { status: 500 },
      );
    }

    // If it's a rig, optionally delete the connection too
    // (keeping it commented - user might want to reconnect later)
    // if (installation.registry?.type === 'rig') {
    //   await supabase
    //     .from('exo_rig_connections')
    //     .delete()
    //     .eq('tenant_id', user.id)
    //     .eq('rig_slug', installation.registry.slug);
    // }

    return NextResponse.json({
      success: true,
      message: `${installation.registry?.name} uninstalled`,
    });
  } catch (error) {
    logger.error("[Installations] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
