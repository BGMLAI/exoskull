/**
 * Context Enrichment Worker — Extract facts from recent conversations
 * to enrich tenant profiles and entity records.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runContextEnrichment(
  ctx: WorkContext,
): Promise<WorkResult> {
  const tenantId = ctx.tenantId!;
  const db = getServiceSupabase();

  try {
    // Get recent inbound messages (last 24h)
    const { data: messages } = await db
      .from("exo_unified_messages")
      .select("content, channel, created_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) {
      return { success: true, costCents: 0, result: { enriched: 0 } };
    }

    // Extract basic signals without AI (rule-based enrichment)
    const signals = {
      messageCount: messages.length,
      channels: [...new Set(messages.map((m) => m.channel))],
      avgLength: Math.round(
        messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) /
          messages.length,
      ),
      lastActive: messages[0].created_at,
    };

    // Update tenant activity metadata
    await db
      .from("exo_tenant_loop_config")
      .update({
        last_activity_at: signals.lastActive,
      })
      .eq("tenant_id", tenantId);

    // Count topics mentioned (simple keyword matching for enrichment)
    const allContent = messages
      .map((m) => m.content || "")
      .join(" ")
      .toLowerCase();
    const topicSignals: Record<string, boolean> = {
      health: /zdrowi|sen|sport|ćwicz|kalorii|wag/.test(allContent),
      work: /prac|projekt|deadline|meeting|task|spotkani/.test(allContent),
      finance: /pieniądz|budżet|wydatek|oszczędz|inwestycj|koszty/.test(
        allContent,
      ),
      social: /przyjaci|rodzin|spotkan|impreza|relacj/.test(allContent),
      learning: /ucz|kurs|książk|czytam|rozw/.test(allContent),
    };

    const activeTopics = Object.entries(topicSignals)
      .filter(([, v]) => v)
      .map(([k]) => k);

    logger.info("[ContextEnrichment] Signals extracted:", {
      tenantId: tenantId.slice(0, 8),
      messageCount: signals.messageCount,
      channels: signals.channels,
      activeTopics,
    });

    return {
      success: true,
      costCents: 0,
      result: {
        enriched: messages.length,
        channels: signals.channels,
        activeTopics,
      },
    };
  } catch (err) {
    logger.error("[ContextEnrichment] Failed:", { tenantId, error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
