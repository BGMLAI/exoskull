// =====================================================
// MODS - User-facing Abilities & Extensions
// =====================================================

export * from './types';

// Mod definitions with capabilities and requirements
export const MOD_DEFINITIONS = {
  'sleep-tracker': {
    slug: 'sleep-tracker' as const,
    name: 'Sleep Tracker',
    description: 'Track and analyze your sleep patterns with insights',
    icon: '😴',
    category: 'health' as const,
    requires_rigs: ['oura', 'fitbit', 'apple-health'],
    config_schema: {
      type: 'object',
      properties: {
        goal_hours: { type: 'number', default: 8 },
        bedtime_reminder: { type: 'boolean', default: true },
        bedtime_target: { type: 'string', default: '22:30' },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: true,
      voice: true,
    },
  },

  'energy-monitor': {
    slug: 'energy-monitor' as const,
    name: 'Energy Monitor',
    description: 'Track your energy levels throughout the day',
    icon: '⚡',
    category: 'health' as const,
    requires_rigs: ['oura', 'fitbit'],
    config_schema: {
      type: 'object',
      properties: {
        check_in_times: {
          type: 'array',
          items: { type: 'string' },
          default: ['09:00', '14:00', '19:00'],
        },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: false,
      voice: true,
    },
  },

  'focus-mode': {
    slug: 'focus-mode' as const,
    name: 'Focus Mode',
    description: 'Block distractions and optimize your environment for deep work',
    icon: '🎯',
    category: 'productivity' as const,
    requires_rigs: ['google-calendar', 'philips-hue'],
    config_schema: {
      type: 'object',
      properties: {
        duration_minutes: { type: 'number', default: 90 },
        block_calendar: { type: 'boolean', default: true },
        dim_lights: { type: 'boolean', default: true },
      },
    },
    capabilities: {
      insights: false,
      notifications: true,
      actions: true,
      voice: true,
    },
  },

  'task-manager': {
    slug: 'task-manager' as const,
    name: 'Task Manager',
    description: 'Unified task management synced with Google Tasks, Todoist, and Notion',
    icon: '📋',
    category: 'productivity' as const,
    requires_rigs: ['google-workspace', 'todoist', 'notion'],
    config_schema: {
      type: 'object',
      properties: {
        default_project: { type: 'string' },
        auto_prioritize: { type: 'boolean', default: true },
        google_tasklist_id: { type: 'string', description: 'Google Task List ID (default: @default)' },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: true,
      voice: true,
    },
  },

  'mood-tracker': {
    slug: 'mood-tracker' as const,
    name: 'Mood Tracker',
    description: 'Daily mood check-ins and pattern analysis',
    icon: '🎭',
    category: 'wellbeing' as const,
    requires_rigs: [],
    config_schema: {
      type: 'object',
      properties: {
        check_in_times: {
          type: 'array',
          items: { type: 'string' },
          default: ['08:00', '20:00'],
        },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: false,
      voice: true,
    },
  },

  'habit-tracker': {
    slug: 'habit-tracker' as const,
    name: 'Habit Tracker',
    description: 'Build and maintain positive habits with streak tracking',
    icon: '🔥',
    category: 'wellbeing' as const,
    requires_rigs: [],
    config_schema: {
      type: 'object',
      properties: {
        habits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              frequency: { type: 'string', enum: ['daily', 'weekly'] },
              reminder_time: { type: 'string' },
            },
          },
          default: [],
        },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: true,
      voice: true,
    },
  },

  'spending-tracker': {
    slug: 'spending-tracker' as const,
    name: 'Spending Tracker',
    description: 'Track and categorize your expenses automatically',
    icon: '💰',
    category: 'finance' as const,
    requires_rigs: ['plaid'],
    config_schema: {
      type: 'object',
      properties: {
        budget_alerts: { type: 'boolean', default: true },
        monthly_budget: { type: 'number' },
        categories: {
          type: 'array',
          items: { type: 'string' },
          default: ['food', 'transport', 'entertainment', 'utilities'],
        },
      },
    },
    capabilities: {
      insights: true,
      notifications: true,
      actions: false,
      voice: true,
    },
  },
} as const;

export type ModSlugKey = keyof typeof MOD_DEFINITIONS;

// Get mod definition by slug
export function getModDefinition(slug: string) {
  return MOD_DEFINITIONS[slug as ModSlugKey];
}

// Get all mod slugs
export function getAllModSlugs(): string[] {
  return Object.keys(MOD_DEFINITIONS);
}

// Check if user has required rigs for a mod
export function checkModRequirements(
  modSlug: string,
  connectedRigs: string[]
): { satisfied: boolean; missing: string[] } {
  const mod = MOD_DEFINITIONS[modSlug as ModSlugKey];
  if (!mod) {
    return { satisfied: false, missing: [] };
  }

  const requiredRigs = mod.requires_rigs;
  if (requiredRigs.length === 0) {
    return { satisfied: true, missing: [] };
  }

  // At least one required rig must be connected
  const hasAtLeastOne = requiredRigs.some((r) => connectedRigs.includes(r));

  return {
    satisfied: hasAtLeastOne,
    missing: hasAtLeastOne ? [] : [...requiredRigs],
  };
}
