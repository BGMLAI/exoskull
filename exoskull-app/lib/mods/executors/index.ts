// =====================================================
// MOD EXECUTORS - Central Registry
// =====================================================

import { IModExecutor, ModSlug } from '../types';
import { TaskManagerExecutor, createTaskManagerExecutor } from './task-manager';
import { MoodTrackerExecutor } from './mood-tracker';
import { HabitTrackerExecutor } from './habit-tracker';
import { SleepTrackerExecutor } from './sleep-tracker';
import { ActivityTrackerExecutor } from './activity-tracker';

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

// Registry of all mod executors
const EXECUTORS: Partial<Record<ModSlug, () => IModExecutor>> = {
  'task-manager': createTaskManagerExecutor,
  'mood-tracker': createMoodTrackerExecutor,
  'habit-tracker': createHabitTrackerExecutor,
  'sleep-tracker': createSleepTrackerExecutor,
  'energy-monitor': createActivityTrackerExecutor, // Activity tracker uses energy-monitor slug
};

/**
 * Get executor for a specific mod
 */
export function getModExecutor(slug: ModSlug): IModExecutor | null {
  const factory = EXECUTORS[slug];
  if (!factory) return null;
  return factory();
}

/**
 * Check if mod has an executor implemented
 */
export function hasModExecutor(slug: ModSlug): boolean {
  return slug in EXECUTORS;
}

/**
 * Get list of implemented mod slugs
 */
export function getImplementedMods(): ModSlug[] {
  return Object.keys(EXECUTORS) as ModSlug[];
}

// Re-export executor classes
export { TaskManagerExecutor, createTaskManagerExecutor };
export { MoodTrackerExecutor };
export { HabitTrackerExecutor };
export { SleepTrackerExecutor };
export { ActivityTrackerExecutor };
