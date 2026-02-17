/**
 * Skill Need Detector - Main Orchestrator
 *
 * Combines three detection sources:
 * 1. Request Parser  - explicit user requests ("chcę śledzić X")
 * 2. Pattern Matcher - frequent topics without trackers
 * 3. Gap Bridge      - MAPE-K blind spot detection
 *
 * Deduplicates, ranks, and stores suggestions in exo_skill_suggestions.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import { parseSkillRequests, requestsToSuggestions } from "./request-parser";
import { matchPatterns, patternsToSuggestions } from "./pattern-matcher";
import { bridgeGapsToSuggestions } from "./gap-bridge";
import type {
  DetectionContext,
  DetectionResult,
  SkillSuggestion,
} from "./types";

import { logger } from "@/lib/logger";
// =====================================================
// MAIN DETECTION
// =====================================================

/**
 * Run full skill need detection for a tenant
 *
 * Called from:
 * - Post-conversation CRON (self-updater.ts)
 * - Manual trigger (admin panel)
 */
export async function detectSkillNeeds(
  tenantId: string,
  transcript?: string,
  conversationId?: string,
): Promise<DetectionResult> {
  const stats = {
    request_parsed: 0,
    patterns_matched: 0,
    gaps_bridged: 0,
    duplicates_filtered: 0,
  };

  try {
    // 1. Build detection context
    const context = await buildContext(tenantId, transcript, conversationId);

    // 2. Run all three detectors
    const allSuggestions: SkillSuggestion[] = [];

    // 2a. Request Parser (only if transcript provided)
    if (transcript) {
      const requests = parseSkillRequests(transcript, context);
      const reqSuggestions = requestsToSuggestions(requests, context);
      stats.request_parsed = reqSuggestions.length;
      allSuggestions.push(...reqSuggestions);
    }

    // 2b. Pattern Matcher (analyzes last 7 days of conversations)
    const patternGaps = await matchPatterns(context);
    const patternSuggestions = patternsToSuggestions(patternGaps, context);
    stats.patterns_matched = patternSuggestions.length;
    allSuggestions.push(...patternSuggestions);

    // 2c. Gap Bridge (converts MAPE-K gaps to skill suggestions)
    const gapSuggestions = await bridgeGapsToSuggestions(context);
    stats.gaps_bridged = gapSuggestions.length;
    allSuggestions.push(...gapSuggestions);

    // 3. Deduplicate and rank
    const { unique, filtered } = deduplicateAndRank(allSuggestions, context);
    stats.duplicates_filtered = filtered;

    // 4. Store in database (top 5 per run)
    const stored = await storeSuggestions(unique.slice(0, 5));

    return { suggestions: stored, stats };
  } catch (error) {
    logger.error("[SkillNeedDetector] Detection failed:", {
      error: error instanceof Error ? error.message : error,
      tenant_id: tenantId,
    });
    return { suggestions: [], stats };
  }
}

/**
 * Get pending suggestions for a tenant (for use in conversation context)
 */
export async function getPendingSuggestions(
  tenantId: string,
  limit = 3,
): Promise<SkillSuggestion[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.rpc("get_pending_skill_suggestions", {
      p_tenant_id: tenantId,
      p_limit: limit,
    });
    return (data as SkillSuggestion[]) || [];
  } catch (error) {
    logger.error("[SkillNeedDetector] getPendingSuggestions failed:", {
      error: error instanceof Error ? error.message : error,
    });
    return [];
  }
}

/**
 * Update suggestion status (when user accepts/rejects)
 */
export async function updateSuggestionStatus(
  suggestionId: string,
  status: "accepted" | "rejected" | "generated",
  generatedSkillId?: string,
): Promise<void> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = { status };
  if (status === "rejected") update.dismissed_at = new Date().toISOString();
  if (generatedSkillId) update.generated_skill_id = generatedSkillId;

  const { error } = await supabase
    .from("exo_skill_suggestions")
    .update(update)
    .eq("id", suggestionId);

  if (error) {
    logger.error("[SkillNeedDetector] Status update failed:", {
      error: error.message,
      suggestionId,
      status,
    });
  }
}

// =====================================================
// CONTEXT BUILDING
// =====================================================

async function buildContext(
  tenantId: string,
  transcript?: string,
  conversationId?: string,
): Promise<DetectionContext> {
  const supabase = createServiceClient();

  // Load installed mods
  const { data: mods } = await supabase
    .from("exo_mod_installations")
    .select("slug:registry_id")
    .eq("tenant_id", tenantId)
    .eq("enabled", true);

  // Load existing generated skills
  const { data: skills } = await supabase
    .from("exo_generated_skills")
    .select("slug")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  // Load recent suggestions (to avoid duplicates)
  const { data: recentSugs } = await supabase
    .from("exo_skill_suggestions")
    .select("description")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "accepted", "generated"])
    .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString());

  // Load highlights
  const { data: highlights } = await supabase
    .from("user_memory_highlights")
    .select("category, content")
    .eq("user_id", tenantId)
    .gte("importance", 5)
    .order("importance", { ascending: false })
    .limit(20);

  // Get mod slugs from registry
  const modSlugs: string[] = [];
  if (mods && mods.length > 0) {
    const registryIds = mods
      .map((m) => (m as Record<string, string>).slug)
      .filter(Boolean);
    if (registryIds.length > 0) {
      const { data: registry } = await supabase
        .from("exo_mod_registry")
        .select("slug")
        .in("id", registryIds);
      if (registry) modSlugs.push(...registry.map((r) => r.slug));
    }
  }

  return {
    tenant_id: tenantId,
    transcript: transcript || "",
    conversation_id: conversationId,
    installed_mods: modSlugs,
    existing_skills: (skills || []).map((s) => s.slug),
    recent_suggestions: (recentSugs || []).map((s) => s.description),
    highlights: (highlights || []).map((h) => ({
      category: h.category,
      content: h.content,
    })),
  };
}

// =====================================================
// DEDUPLICATION & RANKING
// =====================================================

function deduplicateAndRank(
  suggestions: SkillSuggestion[],
  context: DetectionContext,
): { unique: SkillSuggestion[]; filtered: number } {
  const seen = new Map<string, SkillSuggestion>();
  let filtered = 0;

  for (const suggestion of suggestions) {
    const key = normalizeKey(suggestion);

    // Skip if already suggested recently
    if (
      context.recent_suggestions.some(
        (s) => s.toLowerCase().includes(key) || key.includes(s.toLowerCase()),
      )
    ) {
      filtered++;
      continue;
    }

    // Keep highest confidence version
    const existing = seen.get(key);
    if (existing) {
      if (suggestion.confidence > existing.confidence) {
        seen.set(key, suggestion);
      }
      filtered++;
    } else {
      seen.set(key, suggestion);
    }
  }

  // Sort by confidence (highest first), then by source priority
  const sourcePriority: Record<string, number> = {
    request_parse: 3, // Explicit requests first
    pattern_match: 2,
    gap_detection: 1,
  };

  const unique = Array.from(seen.values()).sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.1) return confDiff;
    return (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
  });

  return { unique, filtered };
}

function normalizeKey(suggestion: SkillSuggestion): string {
  if (suggestion.suggested_slug) {
    return suggestion.suggested_slug.replace("custom-", "").replace(/-/g, " ");
  }
  return suggestion.description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

// =====================================================
// STORAGE
// =====================================================

async function storeSuggestions(
  suggestions: SkillSuggestion[],
): Promise<SkillSuggestion[]> {
  if (suggestions.length === 0) return [];

  const supabase = createServiceClient();

  const rows = suggestions.map((s) => ({
    tenant_id: s.tenant_id,
    source: s.source,
    description: s.description,
    suggested_slug: s.suggested_slug,
    life_area: s.life_area,
    confidence: s.confidence,
    reasoning: s.reasoning,
    conversation_id: s.conversation_id,
    status: "pending",
  }));

  const { data, error } = await supabase
    .from("exo_skill_suggestions")
    .insert(rows)
    .select();

  if (error) {
    logger.error("[SkillNeedDetector] Store failed:", {
      error: error.message,
      count: rows.length,
    });
    return suggestions; // Return originals even if storage failed
  }

  return (data as SkillSuggestion[]) || suggestions;
}
