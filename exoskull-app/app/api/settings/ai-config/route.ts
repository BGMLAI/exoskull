/**
 * AI Config Settings API
 *
 * GET: Returns iors_ai_config + AI usage summary
 * PATCH: Updates iors_ai_config (deep merge, validates ranges)
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

    // Parallel: AI config (select * for migration resilience) + usage summary
    const [configResult, usageResult] = await Promise.allSettled([
      supabase.from("exo_tenants").select("*").eq("id", user.id).single(),
      supabase
        .from("exo_ai_usage")
        .select("model, tier, estimated_cost, created_at")
        .eq("tenant_id", user.id)
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const tenantRow =
      configResult.status === "fulfilled"
        ? (configResult.value.data as Record<string, unknown> | null)
        : null;
    const aiConfig = tenantRow?.iors_ai_config ?? null;

    // Compute usage summary
    const usageRows =
      usageResult.status === "fulfilled" ? (usageResult.value.data ?? []) : [];

    const today = new Date().toISOString().slice(0, 10);
    const todayCost = usageRows
      .filter(
        (r: { created_at: string }) => r.created_at?.slice(0, 10) === today,
      )
      .reduce(
        (sum: number, r: { estimated_cost: number }) =>
          sum + (r.estimated_cost ?? 0),
        0,
      );

    const perModel: Record<string, number> = {};
    for (const r of usageRows) {
      const model = (r as { model?: string }).model ?? "unknown";
      perModel[model] = (perModel[model] ?? 0) + 1;
    }

    return NextResponse.json({
      aiConfig: aiConfig ?? null,
      usage: {
        todayCostCents: Math.round(todayCost * 100),
        last7dRequests: usageRows.length,
        perModel,
      },
    });
  } catch (error) {
    console.error("[AIConfigAPI] GET Error:", {
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

    // Load current (select * for migration resilience)
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", user.id)
      .single();

    const t = tenant as Record<string, unknown> | null;
    const current = (t?.iors_ai_config as Record<string, unknown>) ?? {};
    const updated = { ...current };

    // Temperature (0-2)
    if (body.temperature !== undefined) {
      const t = Number(body.temperature);
      if (!isNaN(t)) updated.temperature = Math.max(0, Math.min(2, t));
    }

    // TTS speed (0.5-2.0)
    if (body.tts_speed !== undefined) {
      const s = Number(body.tts_speed);
      if (!isNaN(s)) updated.tts_speed = Math.max(0.5, Math.min(2.0, s));
    }

    // TTS voice ID
    if (body.tts_voice_id !== undefined) {
      updated.tts_voice_id = body.tts_voice_id || null;
    }

    // Model preferences (deep merge)
    if (body.model_preferences && typeof body.model_preferences === "object") {
      const validModels = ["auto", "flash", "haiku", "sonnet", "opus"];
      const currentPrefs =
        (current.model_preferences as Record<string, string>) ?? {};
      const newPrefs = { ...currentPrefs };

      for (const [key, val] of Object.entries(body.model_preferences)) {
        if (typeof val === "string" && validModels.includes(val)) {
          newPrefs[key] = val;
        }
      }
      updated.model_preferences = newPrefs;
    }

    // Permissions (deep merge)
    if (body.permissions && typeof body.permissions === "object") {
      const currentPerms =
        (current.permissions as Record<
          string,
          { with_approval: boolean; autonomous: boolean }
        >) ?? {};
      const newPerms = { ...currentPerms };

      for (const [key, val] of Object.entries(body.permissions)) {
        if (val && typeof val === "object") {
          const v = val as { with_approval?: boolean; autonomous?: boolean };
          newPerms[key] = {
            with_approval:
              v.with_approval ?? currentPerms[key]?.with_approval ?? false,
            autonomous: v.autonomous ?? currentPerms[key]?.autonomous ?? false,
          };
          // Autonomous implies with_approval
          if (newPerms[key].autonomous) {
            newPerms[key].with_approval = true;
          }
        }
      }
      updated.permissions = newPerms;
    }

    const { error } = await supabase
      .from("exo_tenants")
      .update({
        iors_ai_config: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("[AIConfigAPI] PATCH failed:", {
        userId: user.id,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to update AI config" },
        { status: 500 },
      );
    }

    return NextResponse.json({ aiConfig: updated });
  } catch (error) {
    console.error("[AIConfigAPI] PATCH Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
