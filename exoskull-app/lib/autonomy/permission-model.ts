/**
 * Permission Model
 *
 * Handles autonomy grants and permission checking for autonomous actions.
 * Uses pattern matching with wildcards (e.g., "send_sms:*").
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AutonomyGrant,
  PermissionCheckResult,
  PermissionCategory,
} from "./types";

import { seedDefaultGrants, isDefaultGranted } from "./default-grants";
import { logger } from "@/lib/logger";

const seedingInProgress = new Map<string, Promise<number>>();
// ============================================================================
// PERMISSION MODEL CLASS
// ============================================================================

export class PermissionModel {
  private supabase: SupabaseClient;
  private cache: Map<string, { grants: AutonomyGrant[]; timestamp: number }> =
    new Map();
  private cacheTtlMs = 60 * 1000; // 1 minute cache

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase =
      supabaseClient ||
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
  }

  // ============================================================================
  // PERMISSION CHECKING
  // ============================================================================

  /**
   * Check if an action is permitted for a user
   */
  async checkPermission(
    userId: string,
    action: string,
  ): Promise<PermissionCheckResult> {
    try {
      // Try database function first (handles wildcards and updates usage)
      const { data, error } = await this.supabase.rpc("check_autonomy_grant", {
        p_user_id: userId,
        p_action_pattern: action,
      });

      if (error) {
        logger.error("[PermissionModel] RPC error:", error);
        // Fallback to defaults on DB error
        if (isDefaultGranted(action)) {
          logger.info(
            `[PermissionModel] Fallback: default grant for ${action}`,
          );
          return { granted: true, reason: "granted" };
        }
        return { granted: false, reason: "no_matching_grant" };
      }

      if (data === true) {
        return { granted: true, reason: "granted" };
      }

      // Check why it was denied
      const grant = await this.findMatchingGrant(userId, action);
      if (!grant) {
        // No grants in DB at all — check defaults and seed them
        const allGrants = await this.getUserGrants(userId, false);
        if (allGrants.length === 0) {
          // Deduplicate concurrent seed calls per user
          if (!seedingInProgress.has(userId)) {
            const seedPromise = seedDefaultGrants(userId)
              .then((count) => {
                this.cache.delete(userId);
                return count;
              })
              .catch((err) => {
                logger.error("[PermissionModel] Seed failed:", err);
                return 0;
              })
              .finally(() => {
                seedingInProgress.delete(userId);
              });
            seedingInProgress.set(userId, seedPromise);
          }
          await seedingInProgress.get(userId);

          // Re-check DB after seed
          const freshGrants = await this.getUserGrants(userId, false);
          if (freshGrants.length > 0) {
            const match = this.findMatchingGrantLocal(freshGrants, action);
            if (match?.isActive) {
              return { granted: true, reason: "granted" };
            }
          }

          // Final fallback to in-memory defaults
          if (isDefaultGranted(action)) {
            return { granted: true, reason: "granted" };
          }
        }
        return { granted: false, reason: "no_matching_grant" };
      }

      if (!grant.isActive) {
        return { granted: false, reason: "disabled", grant };
      }

      if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
        return { granted: false, reason: "expired", grant };
      }

      if (grant.dailyLimit && grant.useCount >= grant.dailyLimit) {
        const isToday = grant.lastUsedAt
          ? new Date(grant.lastUsedAt).toDateString() ===
            new Date().toDateString()
          : false;
        if (isToday) {
          return {
            granted: false,
            reason: "daily_limit_reached",
            grant,
            remainingDaily: 0,
          };
        }
      }

      return { granted: false, reason: "no_matching_grant" };
    } catch (error) {
      logger.error("[PermissionModel] Check error:", error);
      // Fallback to defaults on any error
      if (isDefaultGranted(action)) {
        return { granted: true, reason: "granted" };
      }
      return { granted: false, reason: "no_matching_grant" };
    }
  }

  /**
   * Check multiple actions at once (batch check)
   */
  async checkPermissions(
    userId: string,
    actions: string[],
  ): Promise<Map<string, PermissionCheckResult>> {
    const results = new Map<string, PermissionCheckResult>();

    // Get all grants once
    const grants = await this.getUserGrants(userId);

    for (const action of actions) {
      const matchingGrant = this.findMatchingGrantLocal(grants, action);

      if (!matchingGrant) {
        results.set(action, { granted: false, reason: "no_matching_grant" });
        continue;
      }

      if (!matchingGrant.isActive) {
        results.set(action, {
          granted: false,
          reason: "disabled",
          grant: matchingGrant,
        });
        continue;
      }

      if (
        matchingGrant.expiresAt &&
        new Date(matchingGrant.expiresAt) < new Date()
      ) {
        results.set(action, {
          granted: false,
          reason: "expired",
          grant: matchingGrant,
        });
        continue;
      }

      results.set(action, {
        granted: true,
        reason: "granted",
        grant: matchingGrant,
      });
    }

    return results;
  }

  /**
   * Check if action matches pattern (supports wildcards)
   */
  matchesPattern(pattern: string, action: string): boolean {
    // Exact match
    if (pattern === action) return true;

    // Global wildcard
    if (pattern === "*") return true;

    // Wildcard suffix (e.g., "send_sms:*" matches "send_sms:family")
    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -2); // Remove ":*"
      return action.startsWith(prefix + ":");
    }

    // Category prefix (e.g., "send_sms" matches "send_sms:family")
    if (!pattern.includes(":") && action.startsWith(pattern + ":")) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // GRANT MANAGEMENT
  // ============================================================================

  /**
   * Get all grants for a user
   */
  async getUserGrants(
    userId: string,
    useCache = true,
  ): Promise<AutonomyGrant[]> {
    // Check cache
    if (useCache) {
      const cached = this.cache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        return cached.grants;
      }
    }

    const { data, error } = await this.supabase
      .from("user_autonomy_grants")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("[PermissionModel] Get grants error:", error);
      return [];
    }

    const grants: AutonomyGrant[] = (data || []).map(this.mapGrantFromDb);

    // Update cache
    this.cache.set(userId, { grants, timestamp: Date.now() });

    return grants;
  }

  /**
   * Create a new grant
   */
  async createGrant(params: {
    userId: string;
    actionPattern: string;
    category?: PermissionCategory;
    expiresAt?: string;
    spendingLimit?: number;
    dailyLimit?: number;
  }): Promise<AutonomyGrant | null> {
    const { data, error } = await this.supabase
      .from("user_autonomy_grants")
      .insert({
        user_id: params.userId,
        action_pattern: params.actionPattern,
        category: params.category || this.inferCategory(params.actionPattern),
        expires_at: params.expiresAt || null,
        spending_limit: params.spendingLimit || null,
        daily_limit: params.dailyLimit || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error("[PermissionModel] Create grant error:", error);
      return null;
    }

    // Invalidate cache
    this.cache.delete(params.userId);

    return this.mapGrantFromDb(data);
  }

  /**
   * Revoke a grant
   */
  async revokeGrant(userId: string, grantId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("user_autonomy_grants")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", grantId)
      .eq("user_id", userId);

    if (error) {
      logger.error("[PermissionModel] Revoke grant error:", error);
      return false;
    }

    // Invalidate cache
    this.cache.delete(userId);

    return true;
  }

  /**
   * Record an error for circuit breaker
   */
  async recordError(
    userId: string,
    actionPattern: string,
    errorMessage: string,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("record_autonomy_error", {
      p_user_id: userId,
      p_action_pattern: actionPattern,
      p_error_message: errorMessage,
    });

    if (error) {
      logger.error("[PermissionModel] Record error failed:", error);
    }

    // Invalidate cache
    this.cache.delete(userId);
  }

  /**
   * Get grants by category
   */
  async getGrantsByCategory(
    userId: string,
  ): Promise<Record<PermissionCategory, AutonomyGrant[]>> {
    const grants = await this.getUserGrants(userId);
    const byCategory: Record<PermissionCategory, AutonomyGrant[]> = {
      communication: [],
      tasks: [],
      health: [],
      finance: [],
      calendar: [],
      smart_home: [],
      other: [],
    };

    for (const grant of grants) {
      byCategory[grant.category].push(grant);
    }

    return byCategory;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async findMatchingGrant(
    userId: string,
    action: string,
  ): Promise<AutonomyGrant | null> {
    const grants = await this.getUserGrants(userId);
    return this.findMatchingGrantLocal(grants, action);
  }

  private findMatchingGrantLocal(
    grants: AutonomyGrant[],
    action: string,
  ): AutonomyGrant | null {
    // Try exact match first
    const exact = grants.find((g) => g.actionPattern === action);
    if (exact) return exact;

    // Try wildcard matches
    for (const grant of grants) {
      if (this.matchesPattern(grant.actionPattern, action)) {
        return grant;
      }
    }

    return null;
  }

  private inferCategory(pattern: string): PermissionCategory {
    const action = pattern.split(":")[0].toLowerCase();

    const categoryMap: Record<string, PermissionCategory> = {
      send_sms: "communication",
      send_email: "communication",
      make_call: "communication",
      send_notification: "communication",
      create_task: "tasks",
      complete_task: "tasks",
      update_task: "tasks",
      delete_task: "tasks",
      schedule_event: "calendar",
      create_event: "calendar",
      cancel_event: "calendar",
      update_event: "calendar",
      log_health: "health",
      log_meal: "health",
      log_mood: "health",
      log_sleep: "health",
      transfer_money: "finance",
      pay_bill: "finance",
      log_expense: "finance",
      control_lights: "smart_home",
      set_temperature: "smart_home",
      lock_door: "smart_home",
    };

    return categoryMap[action] || "other";
  }

  private mapGrantFromDb(row: Record<string, unknown>): AutonomyGrant {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      actionPattern: row.action_pattern as string,
      category: (row.category as PermissionCategory) || "other",
      grantedAt: row.granted_at as string,
      expiresAt: row.expires_at as string | null,
      lastUsedAt: row.last_used_at as string | null,
      useCount: row.use_count as number,
      errorCount: row.error_count as number,
      spendingLimit: row.spending_limit as number | null,
      dailyLimit: row.daily_limit as number | null,
      isActive: row.is_active as boolean,
    };
  }

  /**
   * Clear cache (useful after bulk operations)
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let permissionModelInstance: PermissionModel | null = null;

export function getPermissionModel(
  supabaseClient?: SupabaseClient,
): PermissionModel {
  if (!permissionModelInstance) {
    permissionModelInstance = new PermissionModel(supabaseClient);
  }
  return permissionModelInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if action is permitted
 */
export async function isActionPermitted(
  userId: string,
  action: string,
): Promise<boolean> {
  const model = getPermissionModel();
  const result = await model.checkPermission(userId, action);
  return result.granted;
}

/**
 * Quick check with reason
 */
export async function checkAction(
  userId: string,
  action: string,
): Promise<PermissionCheckResult> {
  const model = getPermissionModel();
  return model.checkPermission(userId, action);
}
