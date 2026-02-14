/**
 * Memory Consolidation Worker — Merge short-term memories into
 * long-term patterns and update highlight importance scores.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runMemoryConsolidation(
  ctx: WorkContext,
): Promise<WorkResult> {
  const tenantId = ctx.tenantId!;
  const db = getServiceSupabase();

  try {
    // Get recent highlights (last 24h)
    const { data: highlights } = await db
      .from("exo_memory_highlights")
      .select("id, category, importance, content, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("importance", { ascending: false })
      .limit(50);

    if (!highlights || highlights.length === 0) {
      return { success: true, costCents: 0, result: { consolidated: 0 } };
    }

    // Group by category
    const categories: Record<string, typeof highlights> = {};
    for (const h of highlights) {
      const cat = h.category || "general";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(h);
    }

    // Boost importance for frequently mentioned categories
    let boosted = 0;
    for (const [cat, items] of Object.entries(categories)) {
      if (items.length >= 3) {
        // Category has 3+ highlights in 24h — boost importance
        const ids = items.map((i) => i.id);
        await db
          .from("exo_memory_highlights")
          .update({ importance: Math.min(10, (items[0].importance || 5) + 1) })
          .in("id", ids)
          .eq("tenant_id", tenantId);
        boosted += ids.length;
        logger.info(
          `[MemoryConsolidation] Boosted ${ids.length} highlights in category: ${cat}`,
        );
      }
    }

    // Decay old highlights (>30 days, importance > 1)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await db
      .from("exo_memory_highlights")
      .update({ importance: 1 })
      .eq("tenant_id", tenantId)
      .gt("importance", 1)
      .lt("created_at", thirtyDaysAgo);

    return {
      success: true,
      costCents: 0,
      result: {
        consolidated: highlights.length,
        categoriesFound: Object.keys(categories).length,
        boosted,
      },
    };
  } catch (err) {
    logger.error("[MemoryConsolidation] Failed:", { tenantId, error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
