/**
 * Self-Updating Mechanism
 *
 * Core engine for ExoSkull's self-learning system:
 * - Extract highlights from conversations
 * - Boost referenced highlights
 * - Decay unused highlights
 * - Log learning events
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  extractPotentialHighlights,
  addHighlight,
  boostHighlight,
  getUserHighlights,
  UserHighlight,
} from "../memory/highlights";
import { SelfUpdateResult, LearningEvent } from "../agents/types";
import { detectSkillNeeds } from "../skills/detector";

import { logger } from "@/lib/logger";
// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum confidence for AI-validated highlights
  MIN_CONFIDENCE: 0.6,

  // Maximum highlights per conversation
  MAX_HIGHLIGHTS_PER_CONV: 5,

  // Decay threshold (days since last boost)
  DECAY_AFTER_DAYS: 30,

  // Minimum importance after decay
  MIN_IMPORTANCE: 1,

  // Decay amount per cycle
  DECAY_AMOUNT: 1,

  // Hours to look back for unprocessed conversations
  LOOKBACK_HOURS: 24,

  // Max conversations per batch
  BATCH_SIZE: 50,
};

// ============================================================================
// SELF-UPDATER CLASS
// ============================================================================

export class SelfUpdater {
  private supabase: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase =
      supabaseClient ||
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
  }

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

  /**
   * Run the full self-update cycle
   */
  async runUpdateCycle(): Promise<SelfUpdateResult> {
    const startTime = Date.now();
    let highlightsAdded = 0;
    let highlightsBoosted = 0;
    let conversationsProcessed = 0;
    const patternsDetected: string[] = [];

    logger.info("[SelfUpdater] Starting update cycle...");

    try {
      // 1. Get unprocessed conversations
      const conversations = await this.getUnprocessedConversations();
      logger.info(
        `[SelfUpdater] Found ${conversations.length} unprocessed conversations`,
      );

      // 2. Process each conversation
      const processedConvs: Array<{
        tenant_id: string;
        transcript: string;
        conversation_id: string;
      }> = [];

      for (const conv of conversations) {
        const result = await this.processConversation(conv);
        highlightsAdded += result.added;
        highlightsBoosted += result.boosted;
        conversationsProcessed++;

        // Collect transcript for skill need detection
        const transcript = this.extractTranscript(conv.context);
        if (transcript && transcript.length >= 50) {
          processedConvs.push({
            tenant_id: conv.tenant_id,
            transcript,
            conversation_id: conv.id,
          });
        }
      }

      // 2b. Run skill need detection on processed conversations
      const tenantTranscripts = new Map<
        string,
        { transcripts: string[]; conversationIds: string[] }
      >();
      for (const pc of processedConvs) {
        const existing = tenantTranscripts.get(pc.tenant_id) || {
          transcripts: [],
          conversationIds: [],
        };
        existing.transcripts.push(pc.transcript);
        existing.conversationIds.push(pc.conversation_id);
        tenantTranscripts.set(pc.tenant_id, existing);
      }

      for (const [tenantId, data] of tenantTranscripts) {
        try {
          const combined = data.transcripts.join("\n---\n");
          const lastConvId =
            data.conversationIds[data.conversationIds.length - 1];
          const detection = await detectSkillNeeds(
            tenantId,
            combined,
            lastConvId,
          );
          if (detection.suggestions.length > 0) {
            logger.info(
              `[SelfUpdater] Skill needs detected for ${tenantId}: ${detection.suggestions.length} suggestions`,
            );
            patternsDetected.push(
              ...detection.suggestions.map(
                (s) => `skill_need:${s.suggested_slug || s.description}`,
              ),
            );
          }
        } catch (error) {
          console.error(
            `[SelfUpdater] Skill detection failed for ${tenantId}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      // 3. Log summary event
      await this.logLearningEvent({
        type: "agent_completed",
        tenantId: "system",
        data: {
          cycle: "self_update",
          conversationsProcessed,
          highlightsAdded,
          highlightsBoosted,
          durationMs: Date.now() - startTime,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `[SelfUpdater] Cycle complete: ${conversationsProcessed} convs, ` +
          `${highlightsAdded} added, ${highlightsBoosted} boosted`,
      );
    } catch (error) {
      console.error("[SelfUpdater] Cycle failed:", error);
    }

    return {
      highlightsAdded,
      highlightsBoosted,
      highlightsDecayed: 0, // Decay runs separately
      patternsDetected,
      mitsUpdated: false, // MIT detection runs separately
      processingTimeMs: Date.now() - startTime,
      conversationsProcessed,
    };
  }

  // ============================================================================
  // CONVERSATION PROCESSING
  // ============================================================================

  /**
   * Process a single conversation for highlights
   */
  private async processConversation(conv: {
    id: string;
    tenant_id: string;
    context: Record<string, unknown>;
  }): Promise<{ added: number; boosted: number }> {
    let added = 0;
    let boosted = 0;

    try {
      // 1. Get transcript from context
      const transcript = this.extractTranscript(conv.context);
      if (!transcript || transcript.length < 50) {
        // Too short to be meaningful
        await this.markProcessed(conv.id, 0);
        return { added: 0, boosted: 0 };
      }

      // 2. Get existing highlights for this user
      const existing = await getUserHighlights(this.supabase, conv.tenant_id);
      const existingContents = existing.map((h) => h.content);

      // 3. Extract potential highlights using regex patterns
      const regexCandidates = extractPotentialHighlights(
        transcript,
        existingContents,
      );

      // 3b. Validate with AI if transcript is substantial (>200 chars)
      let candidates = regexCandidates;
      if (regexCandidates.length > 0 && transcript.length > 200) {
        candidates = await this.validateWithAI(
          transcript,
          regexCandidates,
          conv.tenant_id,
        );
      }

      // 4. Add high-confidence candidates
      for (const candidate of candidates.slice(
        0,
        CONFIG.MAX_HIGHLIGHTS_PER_CONV,
      )) {
        if (candidate.importance >= 5) {
          // Basic threshold
          const result = await addHighlight(this.supabase, conv.tenant_id, {
            category: candidate.category,
            content: candidate.content,
            importance: candidate.importance,
            source: "conversation",
          });

          if (result) {
            added++;
            await this.logLearningEvent({
              type: "highlight_added",
              tenantId: conv.tenant_id,
              data: {
                content: candidate.content,
                category: candidate.category,
                importance: candidate.importance,
                conversationId: conv.id,
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // 5. Boost existing highlights if referenced
      for (const existingHighlight of existing) {
        if (this.isReferenced(transcript, existingHighlight.content)) {
          await boostHighlight(this.supabase, existingHighlight.id);
          boosted++;
          await this.logLearningEvent({
            type: "highlight_boosted",
            tenantId: conv.tenant_id,
            data: {
              highlightId: existingHighlight.id,
              content: existingHighlight.content,
              conversationId: conv.id,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 6. Mark conversation as processed
      await this.markProcessed(conv.id, added);
    } catch (error) {
      console.error(
        `[SelfUpdater] Error processing conversation ${conv.id}:`,
        error,
      );
      // Still mark as processed to avoid infinite retries
      await this.markProcessed(conv.id, 0);
    }

    return { added, boosted };
  }

  // ============================================================================
  // HIGHLIGHT DECAY
  // ============================================================================

  /**
   * Run decay cycle for unused highlights
   */
  async runDecayCycle(tenantId?: string): Promise<{ decayed: number }> {
    let decayed = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DECAY_AFTER_DAYS);

    logger.info(
      `[SelfUpdater] Running decay cycle (cutoff: ${cutoffDate.toISOString()}, tenant: ${tenantId || "all"})`,
    );

    try {
      // Find highlights that haven't been boosted recently
      // Scoped to specific tenant when provided; limited to prevent unbounded queries
      let query = this.supabase
        .from("user_memory_highlights")
        .select("id, user_id, content, importance")
        .lt("updated_at", cutoffDate.toISOString())
        .gt("importance", CONFIG.MIN_IMPORTANCE)
        .order("updated_at", { ascending: true })
        .limit(500);

      if (tenantId) {
        query = query.eq("user_id", tenantId);
      }

      const { data: staleHighlights, error } = await query;

      if (error) {
        console.error("[SelfUpdater] Error fetching stale highlights:", error);
        return { decayed: 0 };
      }

      // Decay each highlight
      for (const highlight of staleHighlights || []) {
        const newImportance = Math.max(
          CONFIG.MIN_IMPORTANCE,
          highlight.importance - CONFIG.DECAY_AMOUNT,
        );

        await this.supabase
          .from("user_memory_highlights")
          .update({ importance: newImportance })
          .eq("id", highlight.id);

        decayed++;
        await this.logLearningEvent({
          type: "highlight_decayed",
          tenantId: highlight.user_id,
          data: {
            highlightId: highlight.id,
            content: highlight.content,
            oldImportance: highlight.importance,
            newImportance,
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`[SelfUpdater] Decayed ${decayed} highlights`);
    } catch (error) {
      console.error("[SelfUpdater] Decay cycle failed:", error);
    }

    return { decayed };
  }

  // ============================================================================
  // AI-ENHANCED EXTRACTION (Optional, uses more tokens)
  // ============================================================================

  /**
   * Use AI to validate and enhance highlight candidates.
   * Uses Tier 1 (Gemini Flash) for cost efficiency.
   * Falls back to regex-only candidates on failure.
   */
  async validateWithAI(
    transcript: string,
    candidates: Array<{
      category: UserHighlight["category"];
      content: string;
      importance: number;
    }>,
    tenantId: string,
  ): Promise<
    Array<{
      category: UserHighlight["category"];
      content: string;
      importance: number;
    }>
  > {
    if (candidates.length === 0) return candidates;

    try {
      const { ModelRouter } = await import("../ai/model-router");
      const router = new ModelRouter();

      const candidateList = candidates
        .map(
          (c, i) =>
            `${i + 1}. [${c.category}] "${c.content}" (importance: ${c.importance})`,
        )
        .join("\n");

      const response = await router.route({
        messages: [
          {
            role: "system",
            content: `You are a highlight validator for a personal AI assistant. Your job is to evaluate extracted highlights from user conversations and return only the genuinely useful ones.

Rules:
- Keep highlights that reveal real preferences, goals, patterns, or insights about the user
- Remove highlights that are too generic ("I like things"), too short, or not actionable
- Adjust importance scores: 1-3 = minor detail, 4-6 = useful context, 7-9 = core insight, 10 = defining characteristic
- You may rephrase highlights for clarity but keep the user's meaning

Respond ONLY with a valid JSON array of objects with these fields:
{ "index": number, "content": string, "category": string, "importance": number, "keep": boolean }`,
          },
          {
            role: "user",
            content: `Transcript excerpt:\n"${transcript.slice(0, 2000)}"\n\nCandidate highlights:\n${candidateList}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 1000,
        forceTier: 1,
        tenantId,
      });

      // Parse AI response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn(
          "[SelfUpdater] AI validation returned non-JSON, using regex candidates",
        );
        return candidates;
      }

      const validated: Array<{
        index: number;
        content: string;
        category: string;
        importance: number;
        keep: boolean;
      }> = JSON.parse(jsonMatch[0]);

      // Map back to highlight format with correct category type
      const VALID_CATEGORIES: UserHighlight["category"][] = [
        "preference",
        "pattern",
        "goal",
        "insight",
        "relationship",
      ];

      return validated
        .filter((v) => v.keep && v.index >= 1 && v.index <= candidates.length)
        .map((v) => {
          const original = candidates[v.index - 1];
          const category = VALID_CATEGORIES.includes(
            v.category as UserHighlight["category"],
          )
            ? (v.category as UserHighlight["category"])
            : original.category;
          return {
            content: v.content || original.content,
            category,
            importance: Math.max(
              1,
              Math.min(10, v.importance ?? original.importance),
            ),
          };
        });
    } catch (error) {
      console.error(
        "[SelfUpdater] AI validation failed, using regex candidates:",
        error,
      );
      return candidates;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getUnprocessedConversations(): Promise<
    Array<{ id: string; tenant_id: string; context: Record<string, unknown> }>
  > {
    const { data, error } = await this.supabase.rpc(
      "get_unprocessed_conversations",
      {
        p_limit: CONFIG.BATCH_SIZE,
        p_hours_back: CONFIG.LOOKBACK_HOURS,
      },
    );

    if (error) {
      console.error("[SelfUpdater] Error fetching conversations:", error);
      return [];
    }

    return data || [];
  }

  private extractTranscript(context: Record<string, unknown>): string {
    // Try different paths where transcript might be stored
    if (typeof context.transcript === "string") {
      return context.transcript;
    }
    if (typeof context.summary === "string") {
      return context.summary;
    }
    if (Array.isArray(context.messages)) {
      return context.messages
        .map(
          (m: { role?: string; content?: string }) =>
            `${m.role || "unknown"}: ${m.content || ""}`,
        )
        .join("\n");
    }
    return "";
  }

  private isReferenced(transcript: string, content: string): boolean {
    // Simple substring check (case-insensitive)
    const lowerTranscript = transcript.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Check for significant overlap (at least 3 words match)
    const contentWords = lowerContent.split(/\s+/).filter((w) => w.length > 3);
    const matchingWords = contentWords.filter((word) =>
      lowerTranscript.includes(word),
    );

    return matchingWords.length >= Math.min(3, contentWords.length);
  }

  private async markProcessed(
    conversationId: string,
    highlightsCount: number,
  ): Promise<void> {
    await this.supabase.rpc("mark_conversation_processed", {
      p_conversation_id: conversationId,
      p_highlights_count: highlightsCount,
    });
  }

  private async logLearningEvent(event: LearningEvent): Promise<void> {
    try {
      await this.supabase.rpc("log_learning_event", {
        p_tenant_id: event.tenantId,
        p_event_type: event.type,
        p_data: event.data,
        p_agent_id: event.agentId || null,
      });
    } catch (error) {
      console.error("[SelfUpdater] Failed to log event:", error);
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

let updaterInstance: SelfUpdater | null = null;

export function getSelfUpdater(): SelfUpdater {
  if (!updaterInstance) {
    updaterInstance = new SelfUpdater();
  }
  return updaterInstance;
}

/**
 * Run the update cycle (called by CRON)
 */
export async function runSelfUpdate(): Promise<SelfUpdateResult> {
  const updater = getSelfUpdater();
  return updater.runUpdateCycle();
}

/**
 * Run the decay cycle (called by CRON, daily)
 * @param tenantId Optional — scope decay to a single tenant for isolation
 */
export async function runDecay(
  tenantId?: string,
): Promise<{ decayed: number }> {
  const updater = getSelfUpdater();
  return updater.runDecayCycle(tenantId);
}

/**
 * Process a specific conversation immediately
 * (can be called post-call instead of waiting for CRON)
 */
export async function processConversationNow(
  conversationId: string,
  tenantId: string,
  context: Record<string, unknown>,
): Promise<{ added: number; boosted: number }> {
  const updater = getSelfUpdater();
  // @ts-ignore - accessing private method for immediate processing
  return updater.processConversation({
    id: conversationId,
    tenant_id: tenantId,
    context,
  });
}
