/**
 * Unified Thread API
 *
 * GET /api/unified-thread - Fetch messages for inbox display
 * Supports filtering by channel, direction, unread status
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const serverSupabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel"); // email, sms, voice, web_chat, etc.
    const direction = searchParams.get("direction"); // inbound, outbound
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100,
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = getServiceSupabase();

    // Build query
    let query = supabase
      .from("exo_unified_messages")
      .select("*", { count: "exact" })
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (channel) {
      query = query.eq("channel", channel);
    }

    if (direction) {
      query = query.eq("direction", direction);
    }

    if (unreadOnly) {
      // Filter by metadata.isUnread for emails
      query = query.eq("metadata->>isUnread", "true");
    }

    const { data: messages, error, count } = await query;

    if (error) {
      logger.error("[UnifiedThread API] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 },
      );
    }

    // Get channel counts for filters
    const { data: channelCounts } = await supabase
      .from("exo_unified_messages")
      .select("channel")
      .eq("tenant_id", user.id);

    const counts: Record<string, number> = {};
    let unreadCount = 0;

    if (channelCounts) {
      for (const msg of channelCounts) {
        counts[msg.channel] = (counts[msg.channel] || 0) + 1;
      }
    }

    // Count unread (from metadata)
    const { count: unread } = await supabase
      .from("exo_unified_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", user.id)
      .eq("metadata->>isUnread", "true");

    unreadCount = unread || 0;

    return NextResponse.json({
      messages: messages || [],
      total: count || 0,
      channelCounts: counts,
      unreadCount,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[UnifiedThread API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
