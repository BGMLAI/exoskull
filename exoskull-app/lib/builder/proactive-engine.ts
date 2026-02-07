/**
 * IORS Proactive Engine
 *
 * After onboarding, analyzes user goals and auto-installs
 * relevant Mods as IORS's tools for serving the user.
 */

import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ============================================================================
// GOAL → MOD MAPPING
// ============================================================================

const GOAL_MOD_MAP: Record<string, string[]> = {
  // Primary goals
  productivity: ["habit-tracker", "goal-setter", "weekly-review"],
  health: ["sleep-tracker", "mood-tracker", "exercise-logger", "water-tracker"],
  growth: ["journal", "reading-log", "goal-setter"],
  work_life: ["habit-tracker", "mood-tracker", "weekly-review"],

  // Secondary goals (areas)
  sleep: ["sleep-tracker"],
  sport: ["exercise-logger"],
  finance: ["finance-monitor"],
  relationships: ["social-tracker"],
  habits: ["habit-tracker"],
  learning: ["reading-log"],
  work: ["goal-setter", "weekly-review"],
};

// Everyone gets these after 7 days
const DELAYED_MODS = ["weekly-review"];

// ============================================================================
// AUTO-INSTALL MODS
// ============================================================================

/**
 * Analyze user goals and install relevant Mods
 * Called after onboarding completion
 */
export async function autoInstallMods(tenantId: string): Promise<string[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get user goals from profile
  const { data: tenant, error: tenantError } = await supabase
    .from("exo_tenants")
    .select("primary_goal, secondary_goals, discovery_data")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    console.error("[ProactiveEngine] Failed to get tenant:", tenantError);
    return [];
  }

  // Collect mod slugs based on goals
  const modSlugs = new Set<string>();

  // From primary goal
  if (tenant.primary_goal && GOAL_MOD_MAP[tenant.primary_goal]) {
    GOAL_MOD_MAP[tenant.primary_goal].forEach((slug) => modSlugs.add(slug));
  }

  // From secondary goals
  if (tenant.secondary_goals && Array.isArray(tenant.secondary_goals)) {
    for (const goal of tenant.secondary_goals) {
      if (GOAL_MOD_MAP[goal]) {
        GOAL_MOD_MAP[goal].forEach((slug) => modSlugs.add(slug));
      }
    }
  }

  // Always add mood-tracker (useful for everyone)
  modSlugs.add("mood-tracker");

  logger.info(
    "[ProactiveEngine] Mods to install for",
    tenantId,
    ":",
    Array.from(modSlugs),
  );

  // Get mod IDs from registry
  const { data: mods, error: modsError } = await supabase
    .from("exo_mod_registry")
    .select("id, slug")
    .in("slug", Array.from(modSlugs));

  if (modsError || !mods) {
    console.error("[ProactiveEngine] Failed to get mods:", modsError);
    return [];
  }

  // Install each mod
  const installed: string[] = [];

  for (const mod of mods) {
    const { error: installError } = await supabase
      .from("exo_tenant_mods")
      .upsert(
        {
          tenant_id: tenantId,
          mod_id: mod.id,
          active: true,
        },
        {
          onConflict: "tenant_id,mod_id",
        },
      );

    if (installError) {
      console.error(
        `[ProactiveEngine] Failed to install ${mod.slug}:`,
        installError,
      );
    } else {
      installed.push(mod.slug);
    }
  }

  logger.info(
    `[ProactiveEngine] Installed ${installed.length} mods for ${tenantId}:`,
    installed,
  );

  return installed;
}

/**
 * Install a specific Mod for a tenant (e.g., user asks "chcę śledzić czytanie")
 */
export async function installMod(
  tenantId: string,
  modSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find mod in registry
  const { data: mod, error: modError } = await supabase
    .from("exo_mod_registry")
    .select("id, name")
    .eq("slug", modSlug)
    .single();

  if (modError || !mod) {
    return { success: false, error: `Mod "${modSlug}" nie znaleziony` };
  }

  // Install
  const { error: installError } = await supabase.from("exo_tenant_mods").upsert(
    {
      tenant_id: tenantId,
      mod_id: mod.id,
      active: true,
    },
    {
      onConflict: "tenant_id,mod_id",
    },
  );

  if (installError) {
    return { success: false, error: installError.message };
  }

  return { success: true };
}

/**
 * Get installed Mods for a tenant
 */
export async function getInstalledMods(tenantId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data, error } = await supabase
    .from("exo_tenant_mods")
    .select(
      `
      id,
      active,
      installed_at,
      config_overrides,
      mod:exo_mod_registry (
        id, slug, name, description, icon, category, config
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (error) {
    console.error("[ProactiveEngine] Failed to get installed mods:", error);
    return [];
  }

  return data || [];
}
