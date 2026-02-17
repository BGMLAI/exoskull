/**
 * Canvas Insights Data API
 *
 * GET /api/canvas/data/insights — Returns recent insight deliveries.
 * Joins with source tables to get insight content.
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

    // Get recent insight deliveries
    const { data: deliveries } = await supabase
      .from("exo_insight_deliveries")
      .select("id, source_table, source_id, delivered_at, channel, batch_id")
      .eq("tenant_id", tenantId)
      .order("delivered_at", { ascending: false })
      .limit(10);

    if (!deliveries || deliveries.length === 0) {
      return NextResponse.json({ insights: [] });
    }

    // Enrich each delivery with source content
    const insights = await Promise.all(
      deliveries.map(async (d) => {
        let summary = "";
        let sourceType: "intervention" | "highlight" | "learning" | "unknown" =
          "unknown";

        try {
          if (d.source_table === "exo_interventions") {
            const { data: intv } = await supabase
              .from("exo_interventions")
              .select("title, description, intervention_type")
              .eq("id", d.source_id)
              .maybeSingle();
            summary = intv?.title || intv?.description || "Interwencja";
            sourceType = "intervention";
          } else if (d.source_table === "user_memory_highlights") {
            const { data: hl } = await supabase
              .from("user_memory_highlights")
              .select("content, category")
              .eq("id", d.source_id)
              .maybeSingle();
            summary = hl?.content || "Nowy insight";
            sourceType = "highlight";
          } else if (d.source_table === "learning_events") {
            const { data: le } = await supabase
              .from("learning_events")
              .select("event_type, data")
              .eq("id", d.source_id)
              .maybeSingle();
            const eventData = le?.data as { summary?: string } | null;
            summary =
              eventData?.summary || le?.event_type || "Zdarzenie uczenia";
            sourceType = "learning";
          }
        } catch {
          summary = d.source_table;
        }

        return {
          id: d.id,
          insight_summary: summary,
          delivery_channel: d.channel,
          delivered_at: d.delivered_at,
          source_type: sourceType,
        };
      }),
    );

    return NextResponse.json({
      insights,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Canvas] Insights data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
