// =====================================================
// /api/skills/[id] - GET, PATCH, DELETE individual skill
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { invalidateSkillCache } from "@/lib/skills/registry/dynamic-registry";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// GET /api/skills/[id]
export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id } = await params;
    const supabase = getServiceSupabase();

    const { data: skill, error } = await supabase
      .from("exo_generated_skills")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Get versions
    const { data: versions } = await supabase
      .from("exo_skill_versions")
      .select("id, version, changelog, created_at")
      .eq("skill_id", id)
      .order("created_at", { ascending: false });

    // Get recent execution logs
    const { data: logs } = await supabase
      .from("exo_skill_execution_log")
      .select("action, success, execution_time_ms, error_message, created_at")
      .eq("skill_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      skill,
      versions: versions || [],
      recentExecutions: logs || [],
    });
  } catch (error) {
    console.error("[Skills API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get skill", details: (error as Error).message },
      { status: 500 },
    );
  }
});

// PATCH /api/skills/[id] - Update skill metadata
export const PATCH = withApiLog(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id } = await params;
    const body = await request.json();
    const supabase = getServiceSupabase();

    // Only allow updating certain fields
    const allowedUpdates: Record<string, unknown> = {};
    if (body.name) allowedUpdates.name = body.name;
    if (body.description !== undefined)
      allowedUpdates.description = body.description;
    if (body.config_schema) allowedUpdates.config_schema = body.config_schema;

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { data: skill, error } = await supabase
      .from("exo_generated_skills")
      .update(allowedUpdates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (skill) {
      invalidateSkillCache(skill.slug, tenantId);
    }

    return NextResponse.json({ success: true, skill });
  } catch (error) {
    console.error("[Skills API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update skill", details: (error as Error).message },
      { status: 500 },
    );
  }
});

// DELETE /api/skills/[id] - Archive a skill (soft delete)
export const DELETE = withApiLog(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id } = await params;
    const supabase = getServiceSupabase();

    const { data: skill, error } = await supabase
      .from("exo_generated_skills")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("slug")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (skill) {
      invalidateSkillCache(skill.slug, tenantId);
    }

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    console.error("[Skills API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to archive skill", details: (error as Error).message },
      { status: 500 },
    );
  }
});
