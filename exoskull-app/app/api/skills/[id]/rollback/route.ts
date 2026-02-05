// =====================================================
// POST /api/skills/[id]/rollback - Rollback to previous version
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  rollbackToVersion,
  getVersions,
} from "@/lib/skills/registry/version-manager";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenant ID" }, { status: 401 });
    }

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
    const supabase = getSupabase();
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
    console.error("[Skills API] Rollback error:", error);
    return NextResponse.json(
      { error: "Failed to rollback", details: (error as Error).message },
      { status: 500 },
    );
  }
}
