/**
 * Default Autonomy Grants
 *
 * Conservative defaults applied when a tenant has no grants configured.
 * These enable basic autonomous operations (notifications, tasks, health logging)
 * while blocking risky actions (spending money, calling strangers, deleting data).
 *
 * Users can override via dashboard settings or voice commands.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { PermissionCategory } from "./types";
import { logger } from "@/lib/logger";

// ============================================================================
// DEFAULT GRANT DEFINITIONS
// ============================================================================

export interface DefaultGrant {
  action_pattern: string;
  category: PermissionCategory;
  daily_limit: number | null;
  description: string;
}

/**
 * Grants applied by default — safe, non-destructive actions.
 */
export const DEFAULT_GRANTS: DefaultGrant[] = [
  // Communication — proactive messages
  {
    action_pattern: "send_sms:wellness",
    category: "communication",
    daily_limit: 5,
    description: "Wellness check-ins and mood follow-ups",
  },
  {
    action_pattern: "send_sms:goal",
    category: "communication",
    daily_limit: 3,
    description: "Goal progress updates and nudges",
  },
  {
    action_pattern: "send_sms:reminder",
    category: "communication",
    daily_limit: 5,
    description: "Task and event reminders",
  },
  {
    action_pattern: "send_email:summary",
    category: "communication",
    daily_limit: 2,
    description: "Daily and weekly summaries",
  },
  {
    action_pattern: "send_notification:*",
    category: "communication",
    daily_limit: 20,
    description: "In-app notifications",
  },

  // Tasks — autonomous task management
  {
    action_pattern: "create_task:*",
    category: "tasks",
    daily_limit: 10,
    description: "Create tasks from goals, interventions, detected needs",
  },
  {
    action_pattern: "complete_task:*",
    category: "tasks",
    daily_limit: 10,
    description: "Mark tasks as completed when detected",
  },

  // Health — auto-logging
  {
    action_pattern: "log_health:*",
    category: "health",
    daily_limit: 20,
    description: "Log health metrics from integrations",
  },

  // Check-ins
  {
    action_pattern: "trigger_checkin:*",
    category: "health",
    daily_limit: 5,
    description: "Initiate wellness and energy check-ins",
  },

  // Apps — auto-generate micro-apps from detected needs
  {
    action_pattern: "build_app:*",
    category: "other",
    daily_limit: 2,
    description: "Auto-generate micro-apps from detected needs",
  },

  // Goals — generate and execute goal strategies
  {
    action_pattern: "goal_strategy:*",
    category: "other",
    daily_limit: 3,
    description: "Generate and execute goal strategies",
  },
];

/**
 * Actions explicitly DENIED by default — require user opt-in.
 */
export const DENIED_BY_DEFAULT = [
  "send_sms:stranger", // Calling/texting unknown numbers
  "make_call:*", // Voice calls (intrusive)
  "spend_money:*", // Any financial actions
  "transfer_money:*", // Money transfers
  "delete_data:*", // Data deletion
  "modify_source:*", // Self-modification
  "create_event:*", // Calendar modifications (needs explicit opt-in)
];

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

/**
 * Seed default grants for a tenant if they have none.
 * Called from: onboarding, permission check fallback, migration.
 *
 * Returns number of grants created.
 */
export async function seedDefaultGrants(
  tenantId: string,
  supabaseClient?: SupabaseClient,
): Promise<number> {
  const supabase =
    supabaseClient ||
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

  // Check if tenant already has grants
  const { count } = await supabase
    .from("user_autonomy_grants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tenantId)
    .eq("is_active", true);

  if (count && count > 0) {
    return 0; // Already has grants
  }

  // Insert defaults
  const rows = DEFAULT_GRANTS.map((g) => ({
    user_id: tenantId,
    action_pattern: g.action_pattern,
    category: g.category,
    daily_limit: g.daily_limit,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("user_autonomy_grants")
    .upsert(rows, { onConflict: "user_id,action_pattern" })
    .select("id");

  if (error) {
    logger.error("[DefaultGrants] Seed failed:", {
      error: error.message,
      tenantId,
    });
    return 0;
  }

  logger.info(
    `[DefaultGrants] Seeded ${data?.length || 0} default grants for tenant ${tenantId}`,
  );

  return data?.length || 0;
}

/**
 * Check if an action is in the default grant list (for fallback without DB).
 * Used when DB grants query returns empty.
 */
export function isDefaultGranted(action: string): boolean {
  for (const grant of DEFAULT_GRANTS) {
    const pattern = grant.action_pattern;

    // Exact match
    if (pattern === action) return true;

    // Wildcard suffix
    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -2);
      if (action.startsWith(prefix + ":") || action === prefix) return true;
    }

    // Category prefix
    if (!pattern.includes(":") && action.startsWith(pattern + ":")) return true;
  }

  // Check if explicitly denied
  for (const denied of DENIED_BY_DEFAULT) {
    if (denied === action) return false;
    if (denied.endsWith(":*")) {
      const prefix = denied.slice(0, -2);
      if (action.startsWith(prefix + ":") || action === prefix) return false;
    }
  }

  return false;
}

/**
 * Get the daily limit for a default grant.
 */
export function getDefaultDailyLimit(action: string): number | null {
  for (const grant of DEFAULT_GRANTS) {
    const pattern = grant.action_pattern;
    if (pattern === action) return grant.daily_limit;
    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -2);
      if (action.startsWith(prefix + ":") || action === prefix)
        return grant.daily_limit;
    }
  }
  return null;
}
