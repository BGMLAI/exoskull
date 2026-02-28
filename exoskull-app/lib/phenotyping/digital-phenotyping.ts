/**
 * Digital Phenotyping Service
 *
 * Analyzes passive behavioral data to understand user patterns:
 *   - Screen time / app usage → productivity vs distraction
 *   - Activity / movement → sedentary patterns
 *   - Sleep → recovery quality
 *   - Ambient data → context awareness
 *
 * All data is analyzed against user's active goals.
 * Generates phenotyping snapshots every configurable interval (default: 15min idle).
 *
 * Privacy: opt-in per feature. Defaults:
 *   - ON: activity, screen time, steps
 *   - OFF: camera, microphone, location
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getGoals } from "@/lib/goals/goal-service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface ScreenTimeEntry {
  packageName: string;
  appName: string;
  durationMinutes: number;
  category: AppCategory;
  foregroundCount: number;
}

export type AppCategory =
  | "social_media"
  | "productivity"
  | "entertainment"
  | "communication"
  | "education"
  | "health"
  | "finance"
  | "news"
  | "gaming"
  | "utilities"
  | "other";

export interface PhenotypingSnapshot {
  tenantId: string;
  timestamp: string;
  /** Screen time breakdown by category */
  screenTime: {
    totalMinutes: number;
    byCategory: Record<AppCategory, number>;
    topApps: Array<{ app: string; minutes: number; category: AppCategory }>;
  };
  /** Activity data */
  activity: {
    steps: number;
    activeMinutes: number;
    sedentaryMinutes: number;
    caloriesBurned: number;
  };
  /** Sleep data (from last night) */
  sleep: {
    durationMinutes: number;
    qualityScore: number;
    debtMinutes: number;
  } | null;
  /** Goal relevance analysis */
  goalInsights: GoalInsight[];
}

export interface GoalInsight {
  goalId: string;
  goalName: string;
  category: string;
  observation: string;
  sentiment: "positive" | "neutral" | "negative";
  /** 0-10 relevance score */
  relevance: number;
}

export interface PhenotypingConfig {
  screenTimeEnabled: boolean;
  activityEnabled: boolean;
  sleepEnabled: boolean;
  locationEnabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  /** Snapshot interval in minutes */
  snapshotIntervalMinutes: number;
}

// ============================================================================
// APP CATEGORIZATION
// ============================================================================

const APP_CATEGORIES: Record<string, AppCategory> = {
  // Social media
  "com.instagram.android": "social_media",
  "com.twitter.android": "social_media",
  "com.facebook.katana": "social_media",
  "com.zhiliaoapp.musically": "social_media", // TikTok
  "com.snapchat.android": "social_media",
  "com.linkedin.android": "social_media",
  "com.reddit.frontpage": "social_media",
  "org.telegram.messenger": "communication",
  "com.whatsapp": "communication",
  "com.discord": "communication",
  "com.slack": "communication",
  "com.Slack": "communication",
  // Productivity
  "com.google.android.apps.docs": "productivity",
  "com.google.android.apps.docs.editors.sheets": "productivity",
  "com.google.android.apps.docs.editors.slides": "productivity",
  "com.microsoft.office.word": "productivity",
  "com.microsoft.office.excel": "productivity",
  "com.todoist": "productivity",
  "com.notion.id": "productivity",
  "com.google.android.calendar": "productivity",
  // Entertainment
  "com.google.android.youtube": "entertainment",
  "com.netflix.mediaclient": "entertainment",
  "com.spotify.music": "entertainment",
  "com.amazon.avod.thirdpartyclient": "entertainment",
  // Education
  "com.duolingo": "education",
  "com.coursera.app": "education",
  "com.google.android.apps.books": "education",
  "com.kindle": "education",
  // Health
  "com.ouraring.oura": "health",
  "com.fitbit.FitbitMobile": "health",
  "com.google.android.apps.fitness": "health",
  // Gaming
  "com.supercell.clashofclans": "gaming",
  "com.king.candycrushsaga": "gaming",
  // Finance
  "com.revolut.revolut": "finance",
  "pl.mbank": "finance",
  "pl.ing.mojeing": "finance",
  "pl.pkobp.iko": "finance",
};

/**
 * Categorize an app by its package name.
 */
export function categorizeApp(packageName: string): AppCategory {
  return APP_CATEGORIES[packageName] || "other";
}

// ============================================================================
// PHENOTYPING ANALYSIS
// ============================================================================

/**
 * Generate a phenotyping snapshot for a tenant.
 * Pulls latest data from all sources, analyzes against goals.
 */
export async function generateSnapshot(
  tenantId: string,
): Promise<PhenotypingSnapshot> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const todayStart = new Date(now.toISOString().split("T")[0] + "T00:00:00Z");

  // ── Screen time (today) ──
  const { data: screenData } = await supabase
    .from("exo_screen_time_entries")
    .select(
      "package_name, app_name, duration_minutes, category, foreground_count",
    )
    .eq("tenant_id", tenantId)
    .gte("recorded_date", todayStart.toISOString().split("T")[0]);

  const screenEntries = (screenData || []) as Array<{
    package_name: string;
    app_name: string;
    duration_minutes: number;
    category: string;
    foreground_count: number;
  }>;

  const byCategory: Record<AppCategory, number> = {
    social_media: 0,
    productivity: 0,
    entertainment: 0,
    communication: 0,
    education: 0,
    health: 0,
    finance: 0,
    news: 0,
    gaming: 0,
    utilities: 0,
    other: 0,
  };

  for (const entry of screenEntries) {
    const cat = (entry.category || "other") as AppCategory;
    byCategory[cat] = (byCategory[cat] || 0) + entry.duration_minutes;
  }

  const totalScreenMinutes = Object.values(byCategory).reduce(
    (a, b) => a + b,
    0,
  );
  const topApps = screenEntries
    .sort((a, b) => b.duration_minutes - a.duration_minutes)
    .slice(0, 5)
    .map((e) => ({
      app: e.app_name || e.package_name,
      minutes: e.duration_minutes,
      category: (e.category || "other") as AppCategory,
    }));

  // ── Activity (today) ──
  const { data: activityData } = await supabase
    .from("exo_health_metrics")
    .select("metric_type, value")
    .eq("tenant_id", tenantId)
    .gte("recorded_at", todayStart.toISOString())
    .in("metric_type", ["steps", "active_minutes", "calories"]);

  let steps = 0;
  let activeMinutes = 0;
  let calories = 0;

  for (const m of activityData || []) {
    switch (m.metric_type) {
      case "steps":
        steps = Math.max(steps, Number(m.value) || 0);
        break;
      case "active_minutes":
        activeMinutes += Number(m.value) || 0;
        break;
      case "calories":
        calories += Number(m.value) || 0;
        break;
    }
  }

  // Estimate sedentary: waking hours minus active minus screen_productive
  const wakingMinutes = 16 * 60; // ~16h
  const sedentaryMinutes = Math.max(
    0,
    wakingMinutes - activeMinutes - byCategory.productivity,
  );

  // ── Sleep (last night) ──
  const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60_000);
  const { data: sleepData } = await supabase
    .from("exo_sleep_entries")
    .select("duration_minutes, quality_score")
    .eq("tenant_id", tenantId)
    .gte("sleep_start", yesterday.toISOString())
    .lt("sleep_start", todayStart.toISOString())
    .order("sleep_start", { ascending: false })
    .limit(1)
    .single();

  const sleep = sleepData
    ? {
        durationMinutes: sleepData.duration_minutes || 0,
        qualityScore: sleepData.quality_score || 0,
        debtMinutes: Math.max(0, 480 - (sleepData.duration_minutes || 0)),
      }
    : null;

  // ── Goal insights ──
  const goalInsights = await analyzeAgainstGoals(tenantId, {
    totalScreenMinutes,
    byCategory,
    steps,
    activeMinutes,
    sleep,
  });

  const snapshot: PhenotypingSnapshot = {
    tenantId,
    timestamp: now.toISOString(),
    screenTime: { totalMinutes: totalScreenMinutes, byCategory, topApps },
    activity: {
      steps,
      activeMinutes,
      sedentaryMinutes,
      caloriesBurned: calories,
    },
    sleep,
    goalInsights,
  };

  // ── Store snapshot ──
  try {
    await supabase.from("exo_phenotyping_snapshots").insert({
      tenant_id: tenantId,
      snapshot_data: snapshot,
      screen_time_total_minutes: totalScreenMinutes,
      steps,
      active_minutes: activeMinutes,
      sleep_duration_minutes: sleep?.durationMinutes || null,
      goal_insights_count: goalInsights.length,
    });
  } catch (err) {
    logger.warn("[Phenotyping] Snapshot store failed:", err);
  }

  return snapshot;
}

/**
 * Analyze phenotyping data against user's active goals.
 */
async function analyzeAgainstGoals(
  tenantId: string,
  data: {
    totalScreenMinutes: number;
    byCategory: Record<AppCategory, number>;
    steps: number;
    activeMinutes: number;
    sleep: {
      durationMinutes: number;
      qualityScore: number;
      debtMinutes: number;
    } | null;
  },
): Promise<GoalInsight[]> {
  const goals = await getGoals(tenantId, { is_active: true, limit: 10 });
  if (goals.length === 0) return [];

  const insights: GoalInsight[] = [];

  for (const goal of goals) {
    const insight = matchGoalToData(goal, data);
    if (insight) {
      insights.push(insight);
    }
  }

  return insights;
}

/**
 * Match a single goal against phenotyping data.
 * Returns an insight if relevant.
 */
function matchGoalToData(
  goal: {
    id: string;
    name: string;
    category: string;
    description: string | null;
  },
  data: {
    totalScreenMinutes: number;
    byCategory: Record<AppCategory, number>;
    steps: number;
    activeMinutes: number;
    sleep: {
      durationMinutes: number;
      qualityScore: number;
      debtMinutes: number;
    } | null;
  },
): GoalInsight | null {
  const cat = goal.category;

  // Productivity goals ↔ screen time analysis
  if (cat === "productivity") {
    const socialMinutes = data.byCategory.social_media || 0;
    const productiveMinutes = data.byCategory.productivity || 0;
    const entertainmentMinutes = data.byCategory.entertainment || 0;
    const distractionMinutes = socialMinutes + entertainmentMinutes;

    if (distractionMinutes > productiveMinutes && distractionMinutes > 60) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Dzisiaj ${Math.round(distractionMinutes / 60)}h rozrywki vs ${Math.round(productiveMinutes / 60)}h produktywnej pracy. Social media: ${socialMinutes}min.`,
        sentiment: "negative",
        relevance: 8,
      };
    }

    if (productiveMinutes > distractionMinutes * 2 && productiveMinutes > 60) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Dobry dzień! ${Math.round(productiveMinutes / 60)}h produktywnej pracy, minimalne rozpraszanie.`,
        sentiment: "positive",
        relevance: 7,
      };
    }
  }

  // Health goals ↔ activity + sleep
  if (cat === "health") {
    if (data.steps < 3000 && data.activeMinutes < 15) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Mało ruchu dzisiaj: ${data.steps} kroków, ${data.activeMinutes}min aktywności. Spróbuj krótkiego spaceru.`,
        sentiment: "negative",
        relevance: 8,
      };
    }

    if (data.steps > 10000) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Świetna aktywność: ${data.steps} kroków! ${data.activeMinutes}min ruchu.`,
        sentiment: "positive",
        relevance: 7,
      };
    }
  }

  // Mental goals ↔ sleep + screen time
  if (cat === "mental") {
    if (data.sleep && data.sleep.qualityScore < 5) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Słaba jakość snu (${data.sleep.qualityScore}/10, ${Math.round(data.sleep.durationMinutes / 60)}h). Dług senny: ${data.sleep.debtMinutes}min.`,
        sentiment: "negative",
        relevance: 9,
      };
    }

    const totalScreen = data.totalScreenMinutes;
    if (totalScreen > 8 * 60) {
      // >8h screen
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Wysoki czas ekranowy: ${Math.round(totalScreen / 60)}h. Rozważ przerwę od ekranów.`,
        sentiment: "negative",
        relevance: 7,
      };
    }
  }

  // Finance goals ↔ finance app usage (proxy for financial awareness)
  if (cat === "finance" && (data.byCategory.finance || 0) > 0) {
    return {
      goalId: goal.id,
      goalName: goal.name,
      category: cat,
      observation: `Sprawdzałeś finanse (${data.byCategory.finance}min w appkach bankowych).`,
      sentiment: "neutral",
      relevance: 4,
    };
  }

  // Learning goals ↔ education app usage
  if (cat === "learning") {
    const eduMinutes = data.byCategory.education || 0;
    if (eduMinutes > 30) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        category: cat,
        observation: `Nauka: ${eduMinutes}min w aplikacjach edukacyjnych. Tak trzymaj!`,
        sentiment: "positive",
        relevance: 7,
      };
    }
  }

  return null;
}

// ============================================================================
// PHENOTYPING CONFIG
// ============================================================================

const DEFAULT_CONFIG: PhenotypingConfig = {
  screenTimeEnabled: true,
  activityEnabled: true,
  sleepEnabled: true,
  locationEnabled: false,
  cameraEnabled: false,
  microphoneEnabled: false,
  snapshotIntervalMinutes: 15,
};

/**
 * Get phenotyping config for a tenant.
 */
export async function getPhenotypingConfig(
  tenantId: string,
): Promise<PhenotypingConfig> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "phenotyping_config")
    .single();

  if (!data?.value) return { ...DEFAULT_CONFIG };

  return { ...DEFAULT_CONFIG, ...(data.value as Partial<PhenotypingConfig>) };
}

/**
 * Update phenotyping config for a tenant.
 */
export async function updatePhenotypingConfig(
  tenantId: string,
  updates: Partial<PhenotypingConfig>,
): Promise<void> {
  const supabase = getServiceSupabase();
  const current = await getPhenotypingConfig(tenantId);
  const merged = { ...current, ...updates };

  await supabase.from("exo_tenant_settings").upsert(
    {
      tenant_id: tenantId,
      key: "phenotyping_config",
      value: merged,
    },
    { onConflict: "tenant_id,key" },
  );
}

/**
 * Format a phenotyping snapshot as a human-readable summary.
 */
export function formatSnapshot(snapshot: PhenotypingSnapshot): string {
  const parts: string[] = [];

  // Screen time
  if (snapshot.screenTime.totalMinutes > 0) {
    const hours = Math.round((snapshot.screenTime.totalMinutes / 60) * 10) / 10;
    parts.push(`**Czas ekranowy:** ${hours}h`);

    const cats = Object.entries(snapshot.screenTime.byCategory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${translateCategory(k as AppCategory)}: ${v}min`)
      .join(", ");
    if (cats) parts.push(`  ${cats}`);

    if (snapshot.screenTime.topApps.length > 0) {
      const top = snapshot.screenTime.topApps
        .slice(0, 3)
        .map((a) => `${a.app} (${a.minutes}min)`)
        .join(", ");
      parts.push(`  Top: ${top}`);
    }
  }

  // Activity
  parts.push(
    `**Aktywność:** ${snapshot.activity.steps} kroków, ${snapshot.activity.activeMinutes}min ruchu`,
  );

  // Sleep
  if (snapshot.sleep) {
    const sleepH = Math.round((snapshot.sleep.durationMinutes / 60) * 10) / 10;
    parts.push(`**Sen:** ${sleepH}h, jakość ${snapshot.sleep.qualityScore}/10`);
  }

  // Goal insights
  if (snapshot.goalInsights.length > 0) {
    parts.push("\n**Analiza celów:**");
    for (const insight of snapshot.goalInsights) {
      const icon =
        insight.sentiment === "positive"
          ? "+"
          : insight.sentiment === "negative"
            ? "-"
            : "~";
      parts.push(`  [${icon}] ${insight.goalName}: ${insight.observation}`);
    }
  }

  return parts.join("\n");
}

function translateCategory(cat: AppCategory): string {
  const map: Record<AppCategory, string> = {
    social_media: "Social media",
    productivity: "Produktywność",
    entertainment: "Rozrywka",
    communication: "Komunikacja",
    education: "Edukacja",
    health: "Zdrowie",
    finance: "Finanse",
    news: "Wiadomości",
    gaming: "Gry",
    utilities: "Narzędzia",
    other: "Inne",
  };
  return map[cat] || cat;
}
