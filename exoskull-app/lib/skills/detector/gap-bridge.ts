/**
 * Gap Bridge - Connects MAPE-K Gap Detection to Skill Suggestions
 *
 * When the MAPE-K loop detects blind spots (areas user doesn't track),
 * this module converts those gaps into skill suggestions.
 *
 * Example: MAPE-K detects "no health data for 14 days" →
 *   Gap Bridge suggests: "Track sleep", "Track exercise", "Track meals"
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { GapAnalysis, LifeArea } from "@/lib/autonomy/types";
import type {
  DetectionContext,
  SkillSuggestion,
  GapSkillMapping,
} from "./types";

// =====================================================
// GAP → SKILL MAPPING
// =====================================================

// Maps life areas to suggested skills when gap detected
const GAP_SKILL_MAP: Record<string, GapSkillMapping["suggested_skills"]> = {
  health: [
    {
      slug: "custom-sleep-logger",
      description: "Track sleep quality and duration",
      priority: 1,
    },
    {
      slug: "custom-exercise-tracker",
      description: "Log workouts and physical activity",
      priority: 2,
    },
    {
      slug: "custom-meal-tracker",
      description: "Track meals and nutrition",
      priority: 3,
    },
    {
      slug: "custom-water-tracker",
      description: "Monitor daily water intake",
      priority: 4,
    },
  ],
  productivity: [
    {
      slug: "custom-focus-tracker",
      description: "Track focus sessions and deep work",
      priority: 1,
    },
    {
      slug: "custom-time-tracker",
      description: "Log time spent on tasks and projects",
      priority: 2,
    },
    {
      slug: "custom-project-tracker",
      description: "Track project milestones and progress",
      priority: 3,
    },
  ],
  finance: [
    {
      slug: "custom-expense-tracker",
      description: "Track daily expenses and spending",
      priority: 1,
    },
    {
      slug: "custom-budget-tracker",
      description: "Monitor budget categories and limits",
      priority: 2,
    },
    {
      slug: "custom-savings-goal",
      description: "Track progress toward savings goals",
      priority: 3,
    },
  ],
  social: [
    {
      slug: "custom-social-tracker",
      description: "Log social interactions and events",
      priority: 1,
    },
    {
      slug: "custom-contact-tracker",
      description: "Track relationships and follow-ups",
      priority: 2,
    },
  ],
  mental: [
    {
      slug: "custom-meditation-tracker",
      description: "Track meditation and mindfulness",
      priority: 1,
    },
    {
      slug: "custom-journal",
      description: "Daily journal for reflection and gratitude",
      priority: 2,
    },
    {
      slug: "custom-stress-tracker",
      description: "Monitor stress levels and triggers",
      priority: 3,
    },
  ],
  learning: [
    {
      slug: "custom-reading-tracker",
      description: "Track books and reading progress",
      priority: 1,
    },
    {
      slug: "custom-course-tracker",
      description: "Track courses and learning sessions",
      priority: 2,
    },
    {
      slug: "custom-skill-practice",
      description: "Log skill practice sessions",
      priority: 3,
    },
  ],
  creativity: [
    {
      slug: "custom-creative-tracker",
      description: "Log creative sessions and projects",
      priority: 1,
    },
    {
      slug: "custom-writing-tracker",
      description: "Track writing progress and word counts",
      priority: 2,
    },
  ],
};

// =====================================================
// GAP BRIDGE
// =====================================================

/**
 * Load recent gap analyses from MAPE-K and convert to skill suggestions
 */
export async function bridgeGapsToSuggestions(
  context: DetectionContext,
): Promise<SkillSuggestion[]> {
  try {
    const gaps = await loadRecentGaps(context.tenant_id);
    if (gaps.length === 0) return [];

    const suggestions: SkillSuggestion[] = [];

    for (const gap of gaps) {
      if (gap.severity !== "moderate" && gap.severity !== "severe") continue;

      const areaSlug = gap.area.slug;
      const skillMappings = GAP_SKILL_MAP[areaSlug];
      if (!skillMappings) continue;

      // Find first skill not already installed/suggested
      for (const mapping of skillMappings) {
        const isInstalled = context.installed_mods.includes(mapping.slug);
        const isExisting = context.existing_skills.includes(mapping.slug);
        const isRecentlySuggested = context.recent_suggestions.some((s) =>
          s
            .toLowerCase()
            .includes(mapping.slug.replace("custom-", "").replace(/-/g, " ")),
        );

        if (isInstalled || isExisting || isRecentlySuggested) continue;

        const confidence = calculateGapConfidence(gap);

        suggestions.push({
          tenant_id: context.tenant_id,
          source: "gap_detection",
          description: mapping.description,
          suggested_slug: mapping.slug,
          life_area: areaSlug,
          confidence,
          reasoning: buildGapReasoning(gap, mapping.description),
          status: "pending",
        });

        // Only suggest top 1 skill per gap area (most relevant first)
        break;
      }
    }

    return suggestions;
  } catch (error) {
    console.error("[GapBridge] Error:", {
      error: error instanceof Error ? error.message : error,
      tenant_id: context.tenant_id,
    });
    return [];
  }
}

// =====================================================
// DATA LOADING
// =====================================================

interface GapInterventionRow {
  id: string;
  trigger_reason: string;
  action_payload: {
    action: string;
    params: {
      title?: string;
      body?: string;
      area?: string;
      severity?: string;
    };
  };
  created_at: string;
}

async function loadRecentGaps(tenantId: string): Promise<GapAnalysis[]> {
  const supabase = createServiceClient();

  // Load gap_detection interventions from last 7 days
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: interventions } = await supabase
    .from("exo_interventions")
    .select("id, trigger_reason, action_payload, created_at")
    .eq("tenant_id", tenantId)
    .eq("intervention_type", "gap_detection")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (!interventions || interventions.length === 0) return [];

  // Convert intervention data back to GapAnalysis-like objects
  return (interventions as GapInterventionRow[]).map((intervention) => {
    const params = intervention.action_payload?.params || {};
    const areaSlug =
      (params.area as string) ||
      extractAreaFromReason(intervention.trigger_reason);

    return {
      area: {
        slug: areaSlug,
        name: areaSlug,
        description: "",
        trackingFrequency: "daily" as const,
        dataPoints: [],
      } satisfies LifeArea,
      lastActivity: null,
      daysSinceActivity: null,
      activityCount30d: 0,
      expectedCount30d: 30,
      coveragePercent: 0,
      severity: (params.severity as GapAnalysis["severity"]) || "moderate",
      suggestedIntervention: intervention.trigger_reason,
    };
  });
}

function extractAreaFromReason(reason: string): string {
  const reasonLower = (reason || "").toLowerCase();
  const areas = [
    "health",
    "productivity",
    "finance",
    "social",
    "mental",
    "learning",
    "creativity",
  ];

  for (const area of areas) {
    if (reasonLower.includes(area)) return area;
  }
  return "other";
}

// =====================================================
// HELPERS
// =====================================================

function calculateGapConfidence(gap: GapAnalysis): number {
  switch (gap.severity) {
    case "severe":
      return 0.8;
    case "moderate":
      return 0.6;
    default:
      return 0.4;
  }
}

function buildGapReasoning(gap: GapAnalysis, skillDesc: string): string {
  const severity = gap.severity === "severe" ? "significant" : "moderate";
  return `${severity} gap detected in ${gap.area.name || gap.area.slug}. ${gap.suggestedIntervention || `No activity tracked in ${gap.area.slug} area.`} Suggested: ${skillDesc}`;
}
