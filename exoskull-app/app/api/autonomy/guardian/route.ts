/**
 * Guardian API Route
 *
 * GET: Returns guardian dashboard data (effectiveness, throttle, values)
 * POST: User updates their values
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user values
    const { data: values } = await supabase
      .from("exo_user_values")
      .select("*")
      .eq("tenant_id", user.id)
      .order("importance", { ascending: false });

    // Get guardian config
    const { data: config } = await supabase
      .from("exo_guardian_config")
      .select("*")
      .eq("tenant_id", user.id)
      .single();

    // Get recent effectiveness stats
    const { data: effectiveness } = await supabase
      .from("exo_intervention_effectiveness")
      .select("effectiveness_score, intervention_type, created_at")
      .eq("tenant_id", user.id)
      .not("effectiveness_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get today's guardian actions
    const today = new Date().toISOString().split("T")[0];
    const { data: todayInterventions } = await supabase
      .from("exo_interventions")
      .select("guardian_verdict, benefit_score")
      .eq("tenant_id", user.id)
      .gte("created_at", `${today}T00:00:00Z`)
      .not("guardian_verdict", "is", null);

    const blocked = (todayInterventions || []).filter(
      (i) => i.guardian_verdict === "blocked",
    ).length;
    const approved = (todayInterventions || []).filter(
      (i) => i.guardian_verdict === "approved",
    ).length;

    // Get unresolved conflicts
    const { data: conflicts } = await supabase
      .from("exo_value_conflicts")
      .select("*")
      .eq("tenant_id", user.id)
      .eq("resolved", false);

    // Average effectiveness
    const scores = (effectiveness || [])
      .map((e) => e.effectiveness_score)
      .filter((s): s is number => s !== null);
    const avgEffectiveness =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : null;

    return NextResponse.json({
      values: values || [],
      config: config || {
        max_interventions_per_day: 10,
        cooldown_minutes: 30,
        min_benefit_score: 4.0,
        disabled_types: [],
      },
      stats: {
        today_approved: approved,
        today_blocked: blocked,
        avg_effectiveness: avgEffectiveness,
        total_measured: scores.length,
      },
      conflicts: conflicts || [],
    });
  } catch (error) {
    console.error("[GuardianAPI] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, data } = body;

    switch (action) {
      case "update_value": {
        const { value_area, importance, description } = data;
        await supabase.from("exo_user_values").upsert(
          {
            tenant_id: user.id,
            value_area,
            importance,
            description,
            source: "explicit",
            last_confirmed_at: new Date().toISOString(),
            drift_detected: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,value_area" },
        );

        return NextResponse.json({ success: true });
      }

      case "resolve_conflict": {
        const { conflict_id, resolution } = data;
        await supabase
          .from("exo_value_conflicts")
          .update({
            resolved: true,
            resolved_by: "user",
            resolved_at: new Date().toISOString(),
            suggested_resolution: resolution,
          })
          .eq("id", conflict_id)
          .eq("tenant_id", user.id);

        return NextResponse.json({ success: true });
      }

      case "update_config": {
        const {
          max_interventions_per_day,
          min_benefit_score,
          cooldown_minutes,
        } = data;
        await supabase.from("exo_guardian_config").upsert(
          {
            tenant_id: user.id,
            ...(max_interventions_per_day !== undefined && {
              max_interventions_per_day,
            }),
            ...(min_benefit_score !== undefined && { min_benefit_score }),
            ...(cooldown_minutes !== undefined && { cooldown_minutes }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" },
        );

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[GuardianAPI] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
