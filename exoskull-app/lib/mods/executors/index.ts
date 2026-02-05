// =====================================================
// MOD EXECUTORS - Central Registry
// Supports both static (bundled) and dynamic (generated) skills
// =====================================================

import { IModExecutor, ModSlug, BuiltinModSlug } from "../types";
import { TaskManagerExecutor, createTaskManagerExecutor } from "./task-manager";
import { MoodTrackerExecutor } from "./mood-tracker";
import { HabitTrackerExecutor } from "./habit-tracker";
import { SleepTrackerExecutor } from "./sleep-tracker";
import { ActivityTrackerExecutor } from "./activity-tracker";
import {
  getDynamicSkillExecutor,
  hasDynamicSkill,
} from "@/lib/skills/registry/dynamic-registry";

// Factory functions for executors
export function createMoodTrackerExecutor(): IModExecutor {
  return new MoodTrackerExecutor();
}

export function createHabitTrackerExecutor(): IModExecutor {
  return new HabitTrackerExecutor();
}

export function createSleepTrackerExecutor(): IModExecutor {
  return new SleepTrackerExecutor();
}

export function createActivityTrackerExecutor(): IModExecutor {
  return new ActivityTrackerExecutor();
}

// Registry of all static (bundled) mod executors
const EXECUTORS: Partial<Record<BuiltinModSlug, () => IModExecutor>> = {
  "task-manager": createTaskManagerExecutor,
  "mood-tracker": createMoodTrackerExecutor,
  "habit-tracker": createHabitTrackerExecutor,
  "sleep-tracker": createSleepTrackerExecutor,
  "energy-monitor": createActivityTrackerExecutor, // Activity tracker uses energy-monitor slug
};

/**
 * Get executor for a specific mod.
 * Checks static executors first, then falls back to dynamic (generated) skills.
 *
 * @param slug - Mod slug (built-in or custom-*)
 * @param tenantId - Required for dynamic skills (to load tenant-specific generated skills)
 */
export async function getModExecutor(
  slug: ModSlug,
  tenantId?: string,
): Promise<IModExecutor | null> {
  // 1. Static executors (bundled)
  const factory = EXECUTORS[slug as BuiltinModSlug];
  if (factory) return factory();

  // 2. Dynamic (generated) skills - requires tenantId
  if (tenantId && slug.startsWith("custom-")) {
    return getDynamicSkillExecutor(slug, tenantId);
  }

  return null;
}

/**
 * Check if mod has an executor implemented (static or dynamic).
 *
 * @param slug - Mod slug
 * @param tenantId - Required for dynamic skills check
 */
export async function hasModExecutor(
  slug: ModSlug,
  tenantId?: string,
): Promise<boolean> {
  // Static check
  if (slug in EXECUTORS) return true;

  // Dynamic check
  if (tenantId && slug.startsWith("custom-")) {
    return hasDynamicSkill(slug, tenantId);
  }

  return false;
}

/**
 * Get list of implemented static mod slugs
 */
export function getImplementedMods(): BuiltinModSlug[] {
  return Object.keys(EXECUTORS) as BuiltinModSlug[];
}

// Re-export executor classes
export { TaskManagerExecutor, createTaskManagerExecutor };
export { MoodTrackerExecutor };
export { HabitTrackerExecutor };
export { SleepTrackerExecutor };
export { ActivityTrackerExecutor };
