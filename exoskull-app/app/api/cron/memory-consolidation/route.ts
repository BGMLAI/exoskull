/**
 * Memory Consolidation CRON
 *
 * Runs nightly at 03:15 UTC (after silver-etl 02:00, before gold-etl 04:00).
 *
 * Pipeline:
 *   1. Gather: today's conversations + goal progress + mood + activities
 *   2. Extract: new facts, preferences, patterns (Gemini Flash)
 *   3. Classify: PAR / Daily / Tacit
 *   4. Embed: generate embeddings for new facts
 *   5. Store: exo_vector_embeddings with layer metadata
 *   6. Graph: update knowledge graph entities
 *   7. Decay: spaced repetition on old highlights (importance -= 0.01/day)
 *   8. Dedup: merge duplicate entities, remove redundant embeddings
 *
 * Inspiration: Nat Eliason's "Every night: review what you discussed, update accordingly"
 *
 * Schedule: 15 3 * * * (daily at 03:15 UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ingest } from "@/lib/memory/ingest";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================================
// CONSOLIDATION PIPELINE
// ============================================================================

interface ConsolidationResult {
  tenantId: string;
  messagesProcessed: number;
  factsExtracted: number;
  chunksStored: number;
  entitiesUpdated: number;
  highlightsDecayed: number;
  error?: string;
}

/**
 * Run memory consolidation for a single tenant.
 */
async function consolidateTenant(
  tenantId: string,
): Promise<ConsolidationResult> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];
  const result: ConsolidationResult = {
    tenantId,
    messagesProcessed: 0,
    factsExtracted: 0,
    chunksStored: 0,
    entitiesUpdated: 0,
    highlightsDecayed: 0,
  };

  try {
    // ── Step 1: Gather today's conversations ──
    const { data: messages } = await supabase
      .from("exo_unified_messages")
      .select("id, content, role, channel, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${today}T00:00:00Z`)
      .order("created_at", { ascending: true });

    if (!messages || messages.length === 0) {
      return result;
    }

    result.messagesProcessed = messages.length;

    // ── Step 2: Extract facts, preferences, patterns via Gemini Flash ──
    const conversationText = messages
      .map((m) => `[${m.role}] ${m.content}`)
      .join("\n")
      .slice(0, 12000);

    let extractedFacts: string[] = [];
    try {
      extractedFacts = await extractFactsFromConversation(conversationText);
      result.factsExtracted = extractedFacts.length;
    } catch (err) {
      logger.warn("[MemoryConsolidation] Fact extraction failed:", {
        error: err instanceof Error ? err.message : String(err),
        tenantId,
      });
    }

    // ── Step 3+4+5: Classify, embed, and store each fact ──
    for (const fact of extractedFacts) {
      try {
        const ingestResult = await ingest({
          tenantId,
          content: fact,
          sourceType: "conversation",
          metadata: {
            consolidated_from: today,
            extraction_type: "nightly_consolidation",
          },
        });

        if (ingestResult.success) {
          result.chunksStored += ingestResult.chunksStored;
          result.entitiesUpdated += ingestResult.entitiesExtracted || 0;
        }
      } catch {
        // Non-blocking: continue with other facts
      }
    }

    // ── Step 6: Embed meaningful conversation messages that weren't embedded yet ──
    try {
      const { ingestConversationBatch } = await import("@/lib/memory/ingest");
      const batchResult = await ingestConversationBatch(tenantId, messages);
      result.chunksStored += batchResult.ingested;
    } catch (err) {
      logger.warn(
        "[MemoryConsolidation] Conversation batch embedding failed:",
        {
          error: err instanceof Error ? err.message : String(err),
          tenantId,
        },
      );
    }

    // ── Step 7: Decay old highlights (spaced repetition) ──
    try {
      const { data: highlights } = await supabase
        .from("user_memory_highlights")
        .select("id, importance")
        .eq("tenant_id", tenantId)
        .gt("importance", 0.1);

      if (highlights && highlights.length > 0) {
        let decayed = 0;
        for (const h of highlights) {
          const newImportance = Math.max(0.05, h.importance - 0.01);
          if (newImportance !== h.importance) {
            await supabase
              .from("user_memory_highlights")
              .update({ importance: newImportance })
              .eq("id", h.id);
            decayed++;
          }
        }
        result.highlightsDecayed = decayed;
      }
    } catch (err) {
      logger.warn("[MemoryConsolidation] Highlight decay failed:", {
        error: err instanceof Error ? err.message : String(err),
        tenantId,
      });
    }

    // ── Step 8: Dedup — remove duplicate embeddings by content_hash ──
    try {
      const { data: dupes } = await supabase.rpc("find_duplicate_embeddings", {
        p_tenant_id: tenantId,
      });
      if (dupes && dupes.length > 0) {
        const dupIds = dupes.map((d: { id: string }) => d.id);
        await supabase
          .from("exo_vector_embeddings")
          .delete()
          .in("id", dupIds.slice(0, 100));
        logger.info("[MemoryConsolidation] Removed duplicates:", {
          count: Math.min(dupIds.length, 100),
          tenantId,
        });
      }
    } catch {
      // Dedup RPC may not exist yet — non-blocking
    }

    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

// ============================================================================
// FACT EXTRACTION (Gemini Flash)
// ============================================================================

/**
 * Extract facts, preferences, and patterns from today's conversation.
 */
async function extractFactsFromConversation(
  conversationText: string,
): Promise<string[]> {
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (!geminiKey) return [];

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Przeanalizuj poniższą rozmowę i wyodrębnij KLUCZOWE FAKTY do zapamiętania. Dla każdego faktu napisz jedno zwięzłe zdanie. Szukaj:

1. PREFERENCJE użytkownika (np. "woli React nad Vue", "pije kawę o 7 rano")
2. FAKTY o życiu (np. "pracuje w firmie X", "ma spotkanie w czwartek")
3. WZORCE zachowań (np. "zawsze odkłada raport na piątek", "nie lubi telefonów")
4. DECYZJE podjęte (np. "zdecydował się na plan A")
5. INFORMACJE BEZPIECZEŃSTWA (np. dane dostępu, ale BEZ samych haseł/kluczy)

Zwróć TYLKO listę faktów, jeden per linia. Jeśli brak istotnych faktów, zwróć puste.

ROZMOWA:
${conversationText}`,
          },
        ],
      },
    ],
    config: { maxOutputTokens: 1000, temperature: 0.2 },
  });

  const text = response.text || "";
  return text
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 10 && l.length < 500);
}

// ============================================================================
// CRON HANDLER
// ============================================================================

async function getHandler(_request: NextRequest) {
  const startTime = Date.now();
  logger.info("[MemoryConsolidation] Starting nightly consolidation...");

  try {
    const supabase = getServiceSupabase();

    // Get all active tenants (who had conversations today)
    const today = new Date().toISOString().split("T")[0];
    const { data: activeTenants } = await supabase
      .from("exo_unified_messages")
      .select("tenant_id")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(100);

    const uniqueTenants = [
      ...new Set((activeTenants || []).map((t) => t.tenant_id)),
    ];

    if (uniqueTenants.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active tenants today",
        duration_ms: Date.now() - startTime,
      });
    }

    // Process each tenant (sequential to avoid rate limits)
    const results: ConsolidationResult[] = [];
    for (const tenantId of uniqueTenants) {
      const result = await consolidateTenant(tenantId);
      results.push(result);
      logger.info("[MemoryConsolidation] Tenant done:", result);
    }

    const totals = results.reduce(
      (acc, r) => ({
        messages: acc.messages + r.messagesProcessed,
        facts: acc.facts + r.factsExtracted,
        chunks: acc.chunks + r.chunksStored,
        entities: acc.entities + r.entitiesUpdated,
        decayed: acc.decayed + r.highlightsDecayed,
        errors: acc.errors + (r.error ? 1 : 0),
      }),
      { messages: 0, facts: 0, chunks: 0, entities: 0, decayed: 0, errors: 0 },
    );

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      tenants_processed: uniqueTenants.length,
      ...totals,
    };

    logger.info("[MemoryConsolidation] Consolidation complete:", response);
    return NextResponse.json(response);
  } catch (error) {
    logger.error("[MemoryConsolidation] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "memory-consolidation" }, getHandler);
