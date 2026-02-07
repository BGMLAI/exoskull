import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Intervention stats
    const { data: interventions } = await db
      .from("exo_interventions")
      .select(
        "id, intervention_type, priority, guardian_verdict, benefit_score, user_feedback, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const total = interventions?.length || 0;
    const approved =
      interventions?.filter(
        (i: { guardian_verdict: string }) => i.guardian_verdict === "approved",
      ).length || 0;
    const blocked =
      interventions?.filter(
        (i: { guardian_verdict: string }) => i.guardian_verdict === "blocked",
      ).length || 0;
    const avgBenefit =
      total > 0
        ? (interventions || []).reduce(
            (sum, i: { benefit_score?: number }) =>
              sum + (i.benefit_score || 0),
            0,
          ) / total
        : 0;

    // User feedback breakdown
    const feedbackBreakdown: Record<string, number> = {};
    for (const i of interventions || []) {
      if (i.user_feedback) {
        feedbackBreakdown[i.user_feedback] =
          (feedbackBreakdown[i.user_feedback] || 0) + 1;
      }
    }

    // Guardian effectiveness
    const { data: effectiveness } = await db
      .from("exo_intervention_effectiveness")
      .select("*")
      .order("measured_at", { ascending: false })
      .limit(50);

    const avgEffectiveness =
      (effectiveness || []).length > 0
        ? (effectiveness || []).reduce(
            (s, e: { effectiveness_score?: number }) =>
              s + (e.effectiveness_score || 0),
            0,
          ) / effectiveness!.length
        : 0;

    // Value conflicts
    const { data: conflicts } = await db
      .from("exo_value_conflicts")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(10);

    // MAPE-K cycles
    const { data: cycles } = await db
      .from("exo_mapek_cycles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      summary: {
        totalInterventions: total,
        approved,
        blocked,
        approvalRate: total > 0 ? approved / total : 0,
        avgBenefitScore: Math.round(avgBenefit * 100) / 100,
        avgEffectiveness: Math.round(avgEffectiveness * 100) / 100,
      },
      feedbackBreakdown,
      recentInterventions: (interventions || []).slice(0, 20),
      effectiveness: effectiveness || [],
      unresolvedConflicts: conflicts || [],
      recentCycles: cycles || [],
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminAutonomy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
