/**
 * GET /api/stream/events — Historical stream events
 *
 * Composes events from multiple tables:
 * - exo_activity_log (tool/cron actions)
 * - exo_emotion_signals (Tau quadrant emotion readings)
 * - exo_insight_deliveries (cross-session insights)
 *
 * Returns StreamEvent[] sorted chronologically.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import type { StreamEvent } from "@/lib/stream/types";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const since =
      searchParams.get("since") ||
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

    const events: StreamEvent[] = [];

    // Parallel queries with 3s timeout each
    const [activityResult, emotionResult, insightResult] =
      await Promise.allSettled([
        // 1. Activity log
        withTimeout(
          Promise.resolve(
            supabase
              .from("exo_activity_log")
              .select(
                "id, action_type, action_name, description, status, source, metadata, created_at",
              )
              .eq("tenant_id", tenantId)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(limit),
          ),
          TIMEOUT_MS,
        ),

        // 2. Emotion signals (Tau quadrant)
        withTimeout(
          Promise.resolve(
            supabase
              .from("exo_emotion_signals")
              .select(
                "id, quadrant, label, valence, arousal, subcriticality, confidence, created_at",
              )
              .eq("tenant_id", tenantId)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(10),
          ),
          TIMEOUT_MS,
        ),

        // 3. Insight deliveries (enriched with source data)
        withTimeout(
          Promise.resolve(
            supabase
              .from("exo_insight_deliveries")
              .select(
                "id, source_table, source_id, channel, delivered_at, batch_id",
              )
              .eq("tenant_id", tenantId)
              .gte("delivered_at", since)
              .order("delivered_at", { ascending: false })
              .limit(10),
          ),
          TIMEOUT_MS,
        ),
      ]);

    // Process activity log
    if (activityResult.status === "fulfilled" && activityResult.value) {
      const result = activityResult.value as {
        data: Array<Record<string, unknown>> | null;
      };
      for (const row of result.data || []) {
        events.push({
          id: `activity-${row.id}`,
          timestamp: new Date(row.created_at as string),
          data: {
            type: "system_notification",
            message: row.description as string,
            severity:
              row.status === "failed"
                ? "warning"
                : row.action_type === "error"
                  ? "warning"
                  : "info",
          },
        });
      }
    }

    // Process emotion signals
    if (emotionResult.status === "fulfilled" && emotionResult.value) {
      const result = emotionResult.value as {
        data: Array<Record<string, unknown>> | null;
      };
      for (const row of result.data || []) {
        events.push({
          id: `emotion-${row.id}`,
          timestamp: new Date(row.created_at as string),
          data: {
            type: "emotion_reading",
            quadrant: row.quadrant as
              | "known_want"
              | "known_unwant"
              | "unknown_want"
              | "unknown_unwant",
            primaryEmotion: row.label as string,
            intensity: row.subcriticality as number,
            valence: row.valence as number,
          },
        });
      }
    }

    // Process insight deliveries (enrich from source tables)
    if (insightResult.status === "fulfilled" && insightResult.value) {
      const result = insightResult.value as {
        data: Array<Record<string, unknown>> | null;
      };
      for (const row of result.data || []) {
        const enriched = await enrichInsight(
          supabase,
          row.source_table as string,
          row.source_id as string,
        );
        if (enriched) {
          events.push({
            id: `insight-${row.id}`,
            timestamp: new Date(row.delivered_at as string),
            data: {
              type: "insight_card",
              title: enriched.title,
              body: enriched.body,
              source: enriched.source,
            },
          });
        }
      }
    }

    // Sort chronologically and limit
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const limited = events.slice(-limit);

    return NextResponse.json({ events: limited });
  } catch (error) {
    logger.error("[StreamEvents] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
});

// Enrich insight delivery by joining source table
async function enrichInsight(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceTable: string,
  sourceId: string,
): Promise<{ title: string; body: string; source: string } | null> {
  try {
    switch (sourceTable) {
      case "exo_interventions": {
        const { data } = await supabase
          .from("exo_interventions")
          .select("title, description, intervention_type")
          .eq("id", sourceId)
          .single();
        if (data) {
          return {
            title: data.title || "Interwencja",
            body: data.description || "",
            source: data.intervention_type || "intervention",
          };
        }
        break;
      }
      case "user_memory_highlights": {
        const { data } = await supabase
          .from("user_memory_highlights")
          .select("content, category")
          .eq("id", sourceId)
          .single();
        if (data) {
          return {
            title: data.category || "Highlight",
            body: data.content || "",
            source: "memory",
          };
        }
        break;
      }
      case "learning_events": {
        const { data } = await supabase
          .from("learning_events")
          .select("event_type, data")
          .eq("id", sourceId)
          .single();
        if (data) {
          const summary =
            typeof data.data === "object" && data.data !== null
              ? (data.data as Record<string, unknown>).summary || ""
              : "";
          return {
            title: data.event_type || "Nauka",
            body: String(summary),
            source: "learning",
          };
        }
        break;
      }
    }
  } catch (err) {
    logger.error("[StreamEvents] Enrich failed:", {
      sourceTable,
      sourceId,
      error: err instanceof Error ? err.message : err,
    });
  }
  return null;
}
