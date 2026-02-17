/**
 * Loops API (Areas/Domains of Life)
 *
 * Top-level organization - areas of attention.
 * Default loops are created for new users.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// ============================================================================
// GET - List loops
// ============================================================================

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const withStats = searchParams.get("withStats") === "true";

    const { data, error } = await supabase
      .from("user_loops")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) {
      logger.error("[Loops API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Optionally include stats for each loop
    if (withStats && data) {
      const loopsWithStats = await Promise.all(
        data.map(async (loop) => {
          const [opsCount, questsCount, notesCount] = await Promise.all([
            supabase
              .from("user_ops")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("loop_slug", loop.slug)
              .in("status", ["pending", "active"]),
            supabase
              .from("user_quests")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("loop_slug", loop.slug)
              .eq("status", "active"),
            supabase
              .from("user_notes")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("loop_slug", loop.slug),
          ]);

          return {
            ...loop,
            stats: {
              activeOps: opsCount.count || 0,
              activeQuests: questsCount.count || 0,
              totalNotes: notesCount.count || 0,
            },
          };
        }),
      );

      return NextResponse.json({ loops: loopsWithStats });
    }

    return NextResponse.json({ loops: data });
  } catch (error) {
    logger.error("[Loops API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// POST - Create loop (or initialize defaults)
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { slug, name, description, icon, color, priority, initDefaults } =
      body;

    // Initialize default loops
    if (initDefaults) {
      const { error } = await supabase.rpc("create_default_loops", {
        p_tenant_id: tenantId,
      });

      if (error) {
        logger.error("[Loops API] Init defaults error:", error);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      const { data: loops } = await supabase
        .from("user_loops")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false });

      return NextResponse.json({ success: true, loops });
    }

    // Create custom loop
    if (!slug || !name) {
      return NextResponse.json(
        { error: "slug and name required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_loops")
      .insert({
        tenant_id: tenantId,
        slug,
        name,
        description,
        icon,
        color,
        priority: priority || 5,
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Loop with this slug already exists" },
          { status: 409 },
        );
      }
      logger.error("[Loops API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, loop: data });
  } catch (error) {
    logger.error("[Loops API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// PATCH - Update loop
// ============================================================================

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { loopId, ...updates } = body;

    if (!loopId) {
      return NextResponse.json({ error: "loopId required" }, { status: 400 });
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.attentionScore !== undefined)
      dbUpdates.attention_score = updates.attentionScore;
    if (updates.lastActivityAt !== undefined)
      dbUpdates.last_activity_at = updates.lastActivityAt;
    if (updates.valueId !== undefined) dbUpdates.value_id = updates.valueId;
    if (updates.visualType !== undefined)
      dbUpdates.visual_type = updates.visualType;
    if (updates.modelUrl !== undefined) dbUpdates.model_url = updates.modelUrl;
    if (updates.thumbnailUrl !== undefined)
      dbUpdates.thumbnail_url = updates.thumbnailUrl;

    const { data, error } = await supabase
      .from("user_loops")
      .update(dbUpdates)
      .eq("id", loopId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      logger.error("[Loops API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, loop: data });
  } catch (error) {
    logger.error("[Loops API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// DELETE - Delete loop (only custom loops)
// ============================================================================

export const DELETE = withApiLog(async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const loopId = searchParams.get("loopId");

    if (!loopId) {
      return NextResponse.json({ error: "loopId required" }, { status: 400 });
    }

    // Check if it's a default loop
    const { data: loop } = await supabase
      .from("user_loops")
      .select("is_default")
      .eq("id", loopId)
      .eq("tenant_id", tenantId)
      .single();

    if (loop?.is_default) {
      return NextResponse.json(
        { error: "Cannot delete default loops" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("user_loops")
      .delete()
      .eq("id", loopId)
      .eq("tenant_id", tenantId);

    if (error) {
      logger.error("[Loops API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Loops API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
