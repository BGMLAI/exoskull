// =====================================================
// POST /api/skills/[id]/rollback - Rollback to previous version
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import {
  rollbackToVersion,
  getVersions,
} from "@/lib/skills/registry/version-manager";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id: skillId } = await params;
    const body = await request.json();
    const { version } = body as { version?: string };

    if (!version) {
      // If no version specified, return available versions
      const versions = await getVersions(skillId);
      return NextResponse.json(
        {
          error: "Specify a version to rollback to",
          availableVersions: versions.map((v) => ({
            version: v.version,
            changelog: v.changelog,
            created_at: v.created_at,
          })),
        },
        { status: 400 },
      );
    }

    // Verify the skill belongs to this tenant
    const supabase = getServiceSupabase();
    const { data: skill, error: loadError } = await supabase
      .from("exo_generated_skills")
      .select("tenant_id")
      .eq("id", skillId)
      .eq("tenant_id", tenantId)
      .single();

    if (loadError || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Perform rollback
    const result = await rollbackToVersion(skillId, version);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Rollback failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Rolled back to version ${version}`,
    });
  } catch (error) {
    logger.error("[Skills API] Rollback error:", error);
    return NextResponse.json(
      { error: "Failed to rollback", details: (error as Error).message },
      { status: 500 },
    );
  }
});
