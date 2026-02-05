// =====================================================
// POST /api/skills/[id]/execute - Execute a skill action
// Supports sandbox mode for pre-approval testing
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executeInSandbox } from "@/lib/skills/sandbox/restricted-function";
import { logExecution } from "@/lib/skills/sandbox/execution-logger";
import { checkCircuitBreaker } from "@/lib/skills/sandbox/circuit-breaker";
import { SkillExecutionContext } from "@/lib/skills/types";

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
    const {
      action,
      params: actionParams,
      method,
      sandbox,
    } = body as {
      action?: string;
      params?: Record<string, unknown>;
      method?: "getData" | "getInsights" | "executeAction" | "getActions";
      sandbox?: boolean;
    };

    // Load the skill - allow pending in sandbox mode
    const supabase = getSupabase();
    const allowedStatuses = sandbox ? ["approved", "pending"] : ["approved"];

    const { data: skill, error: loadError } = await supabase
      .from("exo_generated_skills")
      .select("*")
      .eq("id", skillId)
      .eq("tenant_id", tenantId)
      .in("approval_status", allowedStatuses)
      .is("archived_at", null)
      .single();

    if (loadError || !skill) {
      return NextResponse.json(
        {
          error: sandbox
            ? "Skill not found"
            : "Skill not found or not approved",
        },
        { status: 404 },
      );
    }

    // Determine execution method
    const execMethod = method || (action ? "executeAction" : "getData");
    const execArgs: unknown[] =
      execMethod === "executeAction" ? [action, actionParams || {}] : [];

    const context: SkillExecutionContext = {
      tenant_id: tenantId,
      skill_id: skillId,
      method: execMethod,
      args: execArgs,
    };

    // Execute in sandbox
    const result = await executeInSandbox(context, skill.executor_code);

    // Only log and check circuit breaker for non-sandbox (approved) executions
    if (!sandbox) {
      logExecution(context, result, action, actionParams).catch(() => {});
      checkCircuitBreaker(skillId, tenantId).catch(() => {});
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          executionTimeMs: result.executionTimeMs,
          sandboxMode: !!sandbox,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      result: result.result,
      executionTimeMs: result.executionTimeMs,
      sandboxMode: !!sandbox,
    });
  } catch (error) {
    console.error("[Skills API] Execute error:", error);
    return NextResponse.json(
      { error: "Failed to execute skill", details: (error as Error).message },
      { status: 500 },
    );
  }
}
