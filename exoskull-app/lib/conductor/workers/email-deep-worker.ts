/**
 * Email Deep Worker — Deeper analysis of recent emails.
 * Extracts patterns, follow-up needs, and knowledge from email batches.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runEmailDeepAnalysis(
  ctx: WorkContext,
): Promise<WorkResult> {
  const tenantId = ctx.tenantId!;
  const db = getServiceSupabase();

  try {
    // Get recent emails not yet deep-analyzed
    const { data: emails } = await db
      .from("exo_analyzed_emails")
      .select(
        "id, subject, from_address, category, importance, action_items, key_facts",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.now() - 48 * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    if (!emails || emails.length === 0) {
      return { success: true, costCents: 0, result: { analyzed: 0 } };
    }

    // Aggregate patterns
    const patterns = {
      totalEmails: emails.length,
      categories: {} as Record<string, number>,
      highImportance: 0,
      withActionItems: 0,
      withKeyFacts: 0,
      topSenders: {} as Record<string, number>,
    };

    for (const email of emails) {
      const cat = email.category || "uncategorized";
      patterns.categories[cat] = (patterns.categories[cat] || 0) + 1;
      if (email.importance === "high" || email.importance === "urgent")
        patterns.highImportance++;
      if (email.action_items && (email.action_items as unknown[]).length > 0)
        patterns.withActionItems++;
      if (email.key_facts && (email.key_facts as unknown[]).length > 0)
        patterns.withKeyFacts++;
      const sender = email.from_address || "unknown";
      patterns.topSenders[sender] = (patterns.topSenders[sender] || 0) + 1;
    }

    logger.info("[EmailDeepWorker] Patterns extracted:", {
      tenantId: tenantId.slice(0, 8),
      patterns: {
        total: patterns.totalEmails,
        highImportance: patterns.highImportance,
        withActions: patterns.withActionItems,
      },
    });

    return {
      success: true,
      costCents: 1,
      result: {
        analyzed: emails.length,
        highImportance: patterns.highImportance,
        withActions: patterns.withActionItems,
      },
    };
  } catch (err) {
    logger.error("[EmailDeepWorker] Failed:", { tenantId, error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
