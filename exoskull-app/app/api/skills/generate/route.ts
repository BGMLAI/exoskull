// =====================================================
// POST /api/skills/generate - Generate a new dynamic skill
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { generateSkill } from "@/lib/skills/generator/skill-generator";
import { initiateApproval } from "@/lib/skills/approval/approval-gateway";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Skill generation can take 10-30s

export async function POST(request: NextRequest) {
  try {
    console.info("[Skills API] Generate request received");

    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;
    console.info("[Skills API] Auth OK, tenant:", tenantId);

    const body = await request.json();
    const { description, model } = body as {
      description?: string;
      model?: string;
    };

    if (!description || description.trim().length < 5) {
      return NextResponse.json(
        { error: "Description must be at least 5 characters" },
        { status: 400 },
      );
    }

    const allowedModels = ["claude-sonnet", "codex", "gemini-flash", "auto"];
    if (model && !allowedModels.includes(model)) {
      return NextResponse.json(
        {
          error: `Invalid model. Allowed: ${allowedModels.join(", ")}`,
        },
        { status: 400 },
      );
    }

    console.info("[Skills API] Starting generation:", {
      description: description.trim().slice(0, 80),
      model: model || "auto",
    });

    // Generate the skill (AI code generation + validation + smoke test + DB insert)
    const result = await generateSkill({
      tenant_id: tenantId,
      description: description.trim(),
      source: "user_request",
      model:
        (model as "claude-sonnet" | "codex" | "gemini-flash" | "auto") ||
        "auto",
    });

    if (!result.success || !result.skill) {
      console.error("[Skills API] Generation failed:", {
        error: result.error,
        validationErrors: result.validationErrors,
      });
      return NextResponse.json(
        {
          error: result.error || "Failed to generate skill",
          validationErrors: result.validationErrors,
        },
        { status: 422 },
      );
    }

    console.info("[Skills API] Generation OK, initiating approval");

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
        generated_by: result.skill.generated_by,
      },
      approval: {
        initiated: approvalResult.success,
        requestId: approvalResult.approvalRequestId,
      },
    });
  } catch (error) {
    console.error("[Skills API] Generate error:", {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    return NextResponse.json(
      { error: "Failed to generate skill", details: (error as Error).message },
      { status: 500 },
    );
  }
}
