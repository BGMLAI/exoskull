// =====================================================
// MOD EXECUTORS - Central Registry
// =====================================================

import { IModExecutor, ModSlug } from '../types';
import { TaskManagerExecutor, createTaskManagerExecutor } from './task-manager';

// Registry of all mod executors
const EXECUTORS: Partial<Record<ModSlug, () => IModExecutor>> = {
  'task-manager': createTaskManagerExecutor,
  // Add more executors as they are implemented:
  // 'sleep-tracker': createSleepTrackerExecutor,
  // 'energy-monitor': createEnergyMonitorExecutor,
  // etc.
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

// Re-export individual executors
export { TaskManagerExecutor, createTaskManagerExecutor };
