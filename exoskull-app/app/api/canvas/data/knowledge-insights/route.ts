/**
 * Canvas Knowledge Insights Data API
 *
 * GET /api/canvas/data/knowledge-insights — Returns recent KAE analyses.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { data: analyses, error } = await supabase
      .from("exo_knowledge_analyses")
      .select(
        "id, analysis_type, insights, actions_proposed, actions_executed, cost_cents, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[Canvas] Knowledge insights error:", error);
      return NextResponse.json(
        { error: "Failed to load insights" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      analyses: analyses || [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Canvas] Knowledge insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
