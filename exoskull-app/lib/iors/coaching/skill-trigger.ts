/**
 * Skill/App Auto-Trigger
 *
 * Detects when a user's patterns suggest they need a new skill or app,
 * and proposes it via the coaching system.
 *
 * Flow:
 * 1. Check user_patterns with confidence > 0.7
 * 2. Check if a matching skill already exists
 * 3. If pattern requires UI (tracking, dashboard) → propose build_app
 * 4. If pattern requires only logic → propose accept_skill_suggestion
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export interface SkillProposal {
  type: "skill" | "app";
  name: string;
  description: string;
  reason: string;
  patternId: string;
  confidence: number;
}

export interface SkillTriggerResult {
  proposals: SkillProposal[];
}

/**
 * Analyze patterns and suggest skills/apps.
 * Called from decision-engine when coaching type = "skill_proposal".
 */
export async function detectSkillNeeds(
  tenantId: string,
): Promise<SkillTriggerResult> {
  const supabase = getServiceSupabase();

  const [patternsResult, existingSkillsResult, existingAppsResult] =
    await Promise.allSettled([
      // High-confidence patterns not yet acted on
      supabase
        .from("user_patterns")
        .select("id, pattern_type, description, confidence, data")
        .eq("tenant_id", tenantId)
        .gte("confidence", 0.7)
        .order("confidence", { ascending: false })
        .limit(10),
      // Existing skills (to avoid duplicates)
      supabase
        .from("exo_generated_skills")
        .select("name, description")
        .eq("tenant_id", tenantId)
        .in("approval_status", ["approved", "pending"]),
      // Existing apps (to avoid duplicates)
      supabase
        .from("exo_generated_apps")
        .select("name, description")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
    ]);

  const patterns =
    patternsResult.status === "fulfilled"
      ? (patternsResult.value.data ?? [])
      : [];
  const existingSkills =
    existingSkillsResult.status === "fulfilled"
      ? (existingSkillsResult.value.data ?? [])
      : [];
  const existingApps =
    existingAppsResult.status === "fulfilled"
      ? (existingAppsResult.value.data ?? [])
      : [];

  // Build set of existing skill/app names for dedup
  const existingNames = new Set([
    ...existingSkills.map((s: { name: string }) => s.name.toLowerCase()),
    ...existingApps.map((a: { name: string }) => a.name.toLowerCase()),
  ]);

  const proposals: SkillProposal[] = [];

  for (const pattern of patterns as Array<{
    id: string;
    pattern_type: string;
    description: string;
    confidence: number;
    data: Record<string, unknown>;
  }>) {
    // Skip if we already have something similar
    const descLower = pattern.description.toLowerCase();
    if (
      existingNames.has(descLower) ||
      [...existingNames].some(
        (n) => descLower.includes(n) || n.includes(descLower),
      )
    ) {
      continue;
    }

    // Determine if this needs a full app or just a skill
    const needsUI = patternNeedsUI(pattern);

    proposals.push({
      type: needsUI ? "app" : "skill",
      name: generateName(pattern),
      description: pattern.description,
      reason: `Wykryty wzorzec: ${pattern.pattern_type} (pewnosc: ${Math.round(pattern.confidence * 100)}%)`,
      patternId: pattern.id,
      confidence: pattern.confidence,
    });

    // Max 3 proposals per run
    if (proposals.length >= 3) break;
  }

  logger.info("[SkillTrigger] Detected", {
    tenantId,
    patternsChecked: patterns.length,
    proposals: proposals.length,
  });

  return { proposals };
}

// ── Helpers ──

/** Patterns that typically need a visual interface */
const UI_KEYWORDS = [
  "track",
  "monitor",
  "log",
  "chart",
  "dashboard",
  "history",
  "trend",
  "daily",
  "weekly",
  "summary",
  "report",
  "sledz",
  "monitoruj",
  "rejestruj",
  "wykres",
  "historia",
  "trend",
  "raport",
];

function patternNeedsUI(pattern: {
  pattern_type: string;
  description: string;
  data: Record<string, unknown>;
}): boolean {
  const desc = pattern.description.toLowerCase();
  if (UI_KEYWORDS.some((kw) => desc.includes(kw))) return true;

  // Patterns related to tracking or data entry typically need UI
  if (
    pattern.pattern_type === "recurring_topic" ||
    pattern.pattern_type === "data_tracking"
  ) {
    return true;
  }

  return false;
}

function generateName(pattern: {
  pattern_type: string;
  description: string;
}): string {
  // Extract a short name from the description
  const desc = pattern.description;
  // Take first 3-4 meaningful words
  const words = desc
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  return words.join(" ") || `Skill: ${pattern.pattern_type}`;
}
