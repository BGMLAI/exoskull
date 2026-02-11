/**
 * Canvas Knowledge Insights Data API
 *
 * GET /api/canvas/data/knowledge-insights — Returns recent KAE analyses.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: analyses, error } = await supabase
      .from("exo_knowledge_analyses")
      .select(
        "id, analysis_type, insights, actions_proposed, actions_executed, cost_cents, created_at",
      )
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[Canvas] Knowledge insights error:", error);
      return NextResponse.json(
        { error: "Failed to load insights" },
        { status: 500 },
      );
    }

    return NextResponse.json({ analyses: analyses || [] });
  } catch (error) {
    console.error("[Canvas] Knowledge insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
