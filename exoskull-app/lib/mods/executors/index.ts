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
import { ExerciseLoggerExecutor } from "./exercise-logger";
import { FoodLoggerExecutor } from "./food-logger";
import { WaterTrackerExecutor } from "./water-tracker";
import { SocialTrackerExecutor } from "./social-tracker";
import { JournalExecutor } from "./journal";
import {
  getDynamicSkillExecutor,
  hasDynamicSkill,
} from "@/lib/skills/registry/dynamic-registry";

// Factory functions for executors (used internally)
function createMoodTrackerExecutor(): IModExecutor {
  return new MoodTrackerExecutor();
}

function createHabitTrackerExecutor(): IModExecutor {
  return new HabitTrackerExecutor();
}

function createSleepTrackerExecutor(): IModExecutor {
  return new SleepTrackerExecutor();
}

function createActivityTrackerExecutor(): IModExecutor {
  return new ActivityTrackerExecutor();
}

function createExerciseLoggerExecutor(): IModExecutor {
  return new ExerciseLoggerExecutor();
}

function createFoodLoggerExecutor(): IModExecutor {
  return new FoodLoggerExecutor();
}

function createWaterTrackerExecutor(): IModExecutor {
  return new WaterTrackerExecutor();
}

function createSocialTrackerExecutor(): IModExecutor {
  return new SocialTrackerExecutor();
}

function createJournalExecutor(): IModExecutor {
  return new JournalExecutor();
}

// Registry of all static (bundled) mod executors
const EXECUTORS: Partial<Record<BuiltinModSlug, () => IModExecutor>> = {
  "task-manager": createTaskManagerExecutor,
  "mood-tracker": createMoodTrackerExecutor,
  "habit-tracker": createHabitTrackerExecutor,
  "sleep-tracker": createSleepTrackerExecutor,
  "energy-monitor": createActivityTrackerExecutor,
  "exercise-logger": createExerciseLoggerExecutor,
  "food-logger": createFoodLoggerExecutor,
  "water-tracker": createWaterTrackerExecutor,
  "social-tracker": createSocialTrackerExecutor,
  journal: createJournalExecutor,
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
