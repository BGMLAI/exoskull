// =====================================================
// POST /api/skills/generate - Generate a new dynamic skill
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateSkill } from "@/lib/skills/generator/skill-generator";
import { initiateApproval } from "@/lib/skills/approval/approval-gateway";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Skill generation can take 10-30s

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await request.json();
    const { description } = body as { description?: string };

    if (!description || description.trim().length < 5) {
      return NextResponse.json(
        { error: "Description must be at least 5 characters" },
        { status: 400 },
      );
    }

    // Generate the skill (AI code generation + validation + DB insert)
    const result = await generateSkill({
      tenant_id: tenantId,
      description: description.trim(),
      source: "user_request",
    });

    if (!result.success || !result.skill) {
      return NextResponse.json(
        {
          error: result.error || "Failed to generate skill",
          validationErrors: result.validationErrors,
        },
        { status: 422 },
      );
    }

    // Initiate approval flow
    const approvalResult = await initiateApproval(result.skill);

    return NextResponse.json({
      success: true,
      skill: {
        id: result.skill.id,
        slug: result.skill.slug,
        name: result.skill.name,
        description: result.skill.description,
        version: result.skill.version,
        risk_level: result.skill.risk_level,
        capabilities: result.skill.capabilities,
        approval_status: result.skill.approval_status,
      },
      approval: {
        initiated: approvalResult.success,
        requestId: approvalResult.approvalRequestId,
      },
    });
  } catch (error) {
    console.error("[Skills API] Generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate skill", details: (error as Error).message },
      { status: 500 },
    );
  }
}
