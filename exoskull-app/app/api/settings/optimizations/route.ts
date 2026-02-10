/**
 * Self-Optimization History API
 *
 * GET: Returns optimization history from system_optimizations
 * POST: Approve, reject, or rollback an optimization
 * PATCH: Update permissions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parallel: optimizations history + permissions from iors_ai_config
    const [optResult, tenantResult] = await Promise.allSettled([
      supabase
        .from("system_optimizations")
        .select("*")
        .eq("tenant_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("exo_tenants").select("*").eq("id", user.id).single(),
    ]);

    const optimizations =
      optResult.status === "fulfilled" ? (optResult.value.data ?? []) : [];
    if (optResult.status === "fulfilled" && optResult.value.error) {
      console.error("[OptimizationsAPI] GET optimizations failed:", {
        userId: user.id,
        error: optResult.value.error.message,
      });
    }

    const tenant =
      tenantResult.status === "fulfilled"
        ? (tenantResult.value.data as Record<string, unknown> | null)
        : null;
    const aiConfig = (tenant?.iors_ai_config as Record<string, unknown>) ?? {};
    const permissions = aiConfig.permissions ?? null;

    return NextResponse.json({
      optimizations,
      permissions,
    });
  } catch (error) {
    console.error("[OptimizationsAPI] GET Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.permissions || typeof body.permissions !== "object") {
      return NextResponse.json(
        { error: "Missing permissions object" },
        { status: 400 },
      );
    }

    // Load current iors_ai_config (select * for migration resilience)
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", user.id)
      .single();

    const t = tenant as Record<string, unknown> | null;
    const currentConfig = (t?.iors_ai_config as Record<string, unknown>) ?? {};
    const updatedConfig = { ...currentConfig, permissions: body.permissions };

    const { error } = await supabase
      .from("exo_tenants")
      .update({
        iors_ai_config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("[OptimizationsAPI] PATCH permissions failed:", {
        userId: user.id,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to save permissions" },
        { status: 500 },
      );
    }

    return NextResponse.json({ permissions: body.permissions });
  } catch (error) {
    console.error("[OptimizationsAPI] PATCH Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, id } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing id or action" },
        { status: 400 },
      );
    }

    // Load the optimization
    const { data: opt, error: loadError } = await supabase
      .from("system_optimizations")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", user.id)
      .single();

    if (loadError || !opt) {
      return NextResponse.json(
        { error: "Optimization not found" },
        { status: 404 },
      );
    }

    switch (action) {
      case "approve": {
        if (opt.status !== "proposed") {
          return NextResponse.json(
            { error: "Only proposed optimizations can be approved" },
            { status: 400 },
          );
        }

        // Apply the optimization
        const paramName = opt.parameter_name as string;
        const afterState = opt.after_state;

        await applyOptimization(supabase, user.id, paramName, afterState);

        await supabase
          .from("system_optimizations")
          .update({ status: "applied" })
          .eq("id", id);

        return NextResponse.json({ status: "applied" });
      }

      case "reject": {
        if (opt.status !== "proposed") {
          return NextResponse.json(
            { error: "Only proposed optimizations can be rejected" },
            { status: 400 },
          );
        }

        await supabase
          .from("system_optimizations")
          .update({ status: "rejected" })
          .eq("id", id);

        return NextResponse.json({ status: "rejected" });
      }

      case "rollback": {
        if (opt.status !== "applied") {
          return NextResponse.json(
            { error: "Only applied optimizations can be rolled back" },
            { status: 400 },
          );
        }

        // Restore before_state
        const paramName = opt.parameter_name as string;
        const beforeState = opt.before_state;

        await applyOptimization(supabase, user.id, paramName, beforeState);

        await supabase
          .from("system_optimizations")
          .update({ status: "rolled_back" })
          .eq("id", id);

        return NextResponse.json({ status: "rolled_back" });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[OptimizationsAPI] POST Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Apply an optimization value to the correct DB column.
 */
async function applyOptimization(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  parameterName: string,
  value: unknown,
) {
  // Route to correct table/column based on parameter name
  const tenantFields = [
    "custom_instructions",
    "behavior_presets",
    "system_prompt_override",
  ];
  const configFields = [
    "temperature",
    "tts_speed",
    "tts_voice_id",
    "model_chat",
    "model_analysis",
    "model_coding",
    "model_creative",
    "model_crisis",
  ];
  const loopFields = ["eval_interval_minutes", "daily_ai_budget_cents"];
  const personalityFields = [
    "style_formality",
    "style_humor",
    "style_directness",
    "style_empathy",
    "style_detail",
    "proactivity",
  ];

  if (tenantFields.includes(parameterName)) {
    const col = `iors_${parameterName}`;
    await supabase
      .from("exo_tenants")
      .update({ [col]: value, updated_at: new Date().toISOString() })
      .eq("id", userId);
  } else if (configFields.includes(parameterName)) {
    // Update inside iors_ai_config JSONB
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", userId)
      .single();

    const tRow = tenant as Record<string, unknown> | null;
    const config = (tRow?.iors_ai_config as Record<string, unknown>) ?? {};

    if (parameterName.startsWith("model_")) {
      const category = parameterName.replace("model_", "");
      const prefs = (config.model_preferences as Record<string, string>) ?? {};
      prefs[category] = value as string;
      config.model_preferences = prefs;
    } else {
      config[parameterName] = value;
    }

    await supabase
      .from("exo_tenants")
      .update({
        iors_ai_config: config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } else if (loopFields.includes(parameterName)) {
    const col =
      parameterName === "eval_interval_minutes"
        ? "user_eval_interval_minutes"
        : parameterName;
    await supabase
      .from("exo_tenant_loop_config")
      .update({ [col]: value })
      .eq("tenant_id", userId);
  } else if (personalityFields.includes(parameterName)) {
    // Update inside iors_personality JSONB
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", userId)
      .single();

    const personality =
      (tenant?.iors_personality as Record<string, unknown>) ?? {};

    if (parameterName.startsWith("style_")) {
      const axis = parameterName.replace("style_", "");
      const style = (personality.style as Record<string, number>) ?? {};
      style[axis] = value as number;
      personality.style = style;
    } else {
      personality[parameterName] = value;
    }

    await supabase
      .from("exo_tenants")
      .update({
        iors_personality: personality,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }
}
