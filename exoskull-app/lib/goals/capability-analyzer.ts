/**
 * Capability Analyzer — Detect missing capabilities per goal.
 *
 * For each goal, checks:
 * - Has data source? (measurable_proxies configured or health metrics)
 * - Has tracking app? (exo_generated_apps matching category)
 * - Has relevant skills? (exo_skill_suggestions)
 * - Has integration? (rig_connections)
 *
 * Returns missingCapabilities[] with type and description.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import type { UserGoal, GoalCategory } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface MissingCapability {
  type: "data_source" | "tracking_app" | "skill" | "integration";
  description: string;
  suggestedAction: string;
  priority: number; // 1 = most important
}

export interface GoalCapabilityReport {
  goalId: string;
  goalName: string;
  category: string;
  hasDataSource: boolean;
  hasTrackingApp: boolean;
  hasRelevantSkill: boolean;
  hasIntegration: boolean;
  missingCapabilities: MissingCapability[];
}

// ============================================================================
// CATEGORY → CAPABILITY MAPPING
// ============================================================================

const CATEGORY_DATA_SOURCES: Record<string, string[]> = {
  health: ["google", "apple_health", "fitbit", "garmin"],
  finance: ["revolut", "zen", "kontomatik"],
  productivity: ["google", "notion", "linear"],
  learning: ["kindle", "audible"],
  social: ["google"],
  mental: [],
  creativity: [],
};

const CATEGORY_APP_KEYWORDS: Record<string, string[]> = {
  health: [
    "health",
    "sleep",
    "exercise",
    "workout",
    "fitness",
    "water",
    "meal",
  ],
  finance: ["expense", "budget", "finance", "savings", "money"],
  productivity: ["task", "focus", "time", "project", "habit"],
  learning: ["reading", "course", "book", "study", "skill"],
  social: ["social", "contact", "relationship"],
  mental: ["mood", "meditation", "journal", "stress", "mindfulness"],
  creativity: ["creative", "writing", "art", "music"],
};

const CATEGORY_SKILL_KEYWORDS: Record<string, string[]> = {
  health: ["sleep", "exercise", "meal", "water", "health"],
  finance: ["expense", "budget", "savings"],
  productivity: ["focus", "time", "project"],
  learning: ["reading", "course"],
  social: ["social", "contact"],
  mental: ["meditation", "journal", "mood"],
  creativity: ["creative", "writing"],
};

// ============================================================================
// MAIN
// ============================================================================

/**
 * Analyze capabilities for a single goal.
 */
export async function analyzeGoalCapabilities(
  tenantId: string,
  goal: UserGoal,
): Promise<GoalCapabilityReport> {
  const supabase = getServiceSupabase();
  const category = goal.category || "health";

  const report: GoalCapabilityReport = {
    goalId: goal.id,
    goalName: goal.name,
    category,
    hasDataSource: false,
    hasTrackingApp: false,
    hasRelevantSkill: false,
    hasIntegration: false,
    missingCapabilities: [],
  };

  try {
    // Check in parallel
    const [integrations, apps, skills, checkpoints] = await Promise.all([
      // Rig connections matching category
      supabase
        .from("exo_rig_connections")
        .select("rig_slug")
        .eq("tenant_id", tenantId)
        .not("refresh_token", "is", null),

      // Generated apps matching category
      supabase
        .from("exo_generated_apps")
        .select("slug, name, category")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),

      // Skill suggestions matching category
      supabase
        .from("exo_skill_suggestions")
        .select("suggested_slug, description")
        .eq("tenant_id", tenantId)
        .eq("status", "generated"),

      // Recent checkpoints (data source indicator)
      supabase
        .from("exo_goal_checkpoints")
        .select("data_source")
        .eq("goal_id", goal.id)
        .gte(
          "checkpoint_date",
          new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        )
        .limit(5),
    ]);

    // Check integrations
    const connectedRigs = new Set(
      (integrations.data || []).map((r) => r.rig_slug),
    );
    const relevantRigs = CATEGORY_DATA_SOURCES[category] || [];
    report.hasIntegration = relevantRigs.some((rig) => connectedRigs.has(rig));

    // Check data source (has recent checkpoints with non-manual source)
    const hasAutoData = (checkpoints.data || []).some(
      (c) =>
        c.data_source !== "manual" && c.data_source !== "auto_cron_missing",
    );
    report.hasDataSource =
      hasAutoData ||
      goal.measurable_proxies?.length > 0 ||
      report.hasIntegration;

    // Check tracking app
    const appKeywords = CATEGORY_APP_KEYWORDS[category] || [];
    report.hasTrackingApp = (apps.data || []).some((app) => {
      const slugLower = app.slug.toLowerCase();
      const nameLower = app.name.toLowerCase();
      return appKeywords.some(
        (kw) => slugLower.includes(kw) || nameLower.includes(kw),
      );
    });

    // Check relevant skill
    const skillKeywords = CATEGORY_SKILL_KEYWORDS[category] || [];
    report.hasRelevantSkill = (skills.data || []).some((skill) => {
      const slugLower = skill.suggested_slug.toLowerCase();
      const descLower = (skill.description || "").toLowerCase();
      return skillKeywords.some(
        (kw) => slugLower.includes(kw) || descLower.includes(kw),
      );
    });

    // Build missing capabilities list
    if (!report.hasDataSource) {
      report.missingCapabilities.push({
        type: "data_source",
        description: `Goal "${goal.name}" has no automatic data source`,
        suggestedAction:
          relevantRigs.length > 0
            ? `Connect ${relevantRigs[0]} integration`
            : "Build custom tracker skill",
        priority: 1,
      });
    }

    if (!report.hasTrackingApp) {
      report.missingCapabilities.push({
        type: "tracking_app",
        description: `No tracking app for ${category} category`,
        suggestedAction: `Build ${category} tracker app`,
        priority: 2,
      });
    }

    if (!report.hasRelevantSkill && !report.hasTrackingApp) {
      report.missingCapabilities.push({
        type: "skill",
        description: `No skill for tracking ${category} data`,
        suggestedAction: `Generate ${category} tracking skill`,
        priority: 3,
      });
    }

    if (!report.hasIntegration && relevantRigs.length > 0) {
      report.missingCapabilities.push({
        type: "integration",
        description: `No ${category}-related integration connected`,
        suggestedAction: `Connect ${relevantRigs.join(" or ")}`,
        priority: 4,
      });
    }
  } catch (err) {
    logger.error("[CapabilityAnalyzer] Analysis failed:", {
      goalId: goal.id,
      error: err instanceof Error ? err.message : err,
    });
  }

  return report;
}

/**
 * Analyze capabilities for all active goals of a tenant.
 */
export async function analyzeAllGoalCapabilities(
  tenantId: string,
): Promise<GoalCapabilityReport[]> {
  const supabase = getServiceSupabase();

  const { data: goals } = await supabase
    .from("exo_user_goals")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (!goals || goals.length === 0) return [];

  const reports: GoalCapabilityReport[] = [];
  for (const goal of goals) {
    const report = await analyzeGoalCapabilities(tenantId, goal as UserGoal);
    reports.push(report);
  }

  return reports;
}

/**
 * Get a summary of missing capabilities suitable for AI prompts.
 */
export function summarizeCapabilityGaps(
  reports: GoalCapabilityReport[],
): string {
  const gaps = reports.flatMap((r) =>
    r.missingCapabilities.map(
      (mc) =>
        `- Goal "${r.goalName}" (${r.category}): ${mc.description} → ${mc.suggestedAction}`,
    ),
  );

  if (gaps.length === 0) return "All goals have necessary capabilities.";
  return `Missing capabilities:\n${gaps.join("\n")}`;
}
