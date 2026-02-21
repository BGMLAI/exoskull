/**
 * GET /api/notifications — list notifications (filter: all, unread, type)
 * PATCH /api/notifications — mark as read (body: { ids: [] } or { markAll: true })
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") || "all";
    const limit = parseInt(url.searchParams.get("limit") || "50");

    let query = supabase
      .from("exo_notifications")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter === "unread") {
      query = query.eq("is_read", false);
    } else if (
      ["insight", "alert", "completion", "suggestion", "system"].includes(
        filter,
      )
    ) {
      query = query.eq("type", filter);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("[Notifications API] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 },
      );
    }

    // Get unread count
    const { count } = await supabase
      .from("exo_notifications")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_read", false);

    return NextResponse.json({
      notifications: data || [],
      unreadCount: count || 0,
    });
  } catch (error) {
    logger.error("[Notifications API] GET error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await request.json();

    if (body.markAll) {
      const { error } = await supabase
        .from("exo_notifications")
        .update({ is_read: true })
        .eq("tenant_id", tenantId)
        .eq("is_read", false);

      if (error) {
        logger.error("[Notifications API] PATCH markAll error:", error);
        return NextResponse.json(
          { error: "Failed to mark all as read" },
          { status: 500 },
        );
      }
    } else if (body.ids && Array.isArray(body.ids)) {
      const { error } = await supabase
        .from("exo_notifications")
        .update({ is_read: true })
        .eq("tenant_id", tenantId)
        .in("id", body.ids);

      if (error) {
        logger.error("[Notifications API] PATCH ids error:", error);
        return NextResponse.json(
          { error: "Failed to mark as read" },
          { status: 500 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Provide ids[] or markAll:true" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Notifications API] PATCH error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
