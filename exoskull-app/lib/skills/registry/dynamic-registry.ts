// =====================================================
// DYNAMIC REGISTRY - Load and cache generated skills
// =====================================================

import { createClient } from "@supabase/supabase-js";
import {
  GeneratedSkill,
  SkillExecutionContext,
  SkillExecutionResult,
} from "../types";
import { executeInSandbox } from "../sandbox/restricted-function";
import { logExecution } from "../sandbox/execution-logger";
import { IModExecutor, ModInsight, ModAction } from "@/lib/mods/types";

import { logger } from "@/lib/logger";
// Cache: slug -> { skill, loadedAt }
const skillCache = new Map<
  string,
  { skill: GeneratedSkill; loadedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Check if a dynamic skill exists for the given slug and tenant
 */
export async function hasDynamicSkill(
  slug: string,
  tenantId: string,
): Promise<boolean> {
  const skill = await loadSkill(slug, tenantId);
  return skill !== null;
}

/**
 * Get a dynamic skill executor that wraps sandbox execution.
 * Returns an IModExecutor-compatible object.
 */
export async function getDynamicSkillExecutor(
  slug: string,
  tenantId: string,
): Promise<IModExecutor | null> {
  const skill = await loadSkill(slug, tenantId);
  if (!skill) return null;

  // Return a wrapper that executes the skill code in the sandbox
  return createSandboxExecutor(skill, tenantId);
}

/**
 * Get all active skills for a tenant
 */
export async function getActiveSkillsForTenant(
  tenantId: string,
): Promise<GeneratedSkill[]> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("get_active_skills", {
      p_tenant_id: tenantId,
    });

    if (error) {
      logger.error("[DynamicRegistry] Failed to load active skills:", error);
      return [];
    }

    return (data || []) as GeneratedSkill[];
  } catch (error) {
    logger.error("[DynamicRegistry] Error:", error);
    return [];
  }
}

/**
 * Invalidate cache for a specific skill (e.g., after update/rollback)
 */
export function invalidateSkillCache(slug: string, tenantId: string): void {
  const cacheKey = `${tenantId}:${slug}`;
  skillCache.delete(cacheKey);
}

/**
 * Clear entire skill cache
 */
export function clearSkillCache(): void {
  skillCache.clear();
}

// =====================================================
// Internal helpers
// =====================================================

/**
 * Load a skill from cache or database
 */
async function loadSkill(
  slug: string,
  tenantId: string,
): Promise<GeneratedSkill | null> {
  const cacheKey = `${tenantId}:${slug}`;

  // Check cache
  const cached = skillCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.skill;
  }

  // Load from database
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("exo_generated_skills")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("approval_status", "approved")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    const skill = data as GeneratedSkill;
    skillCache.set(cacheKey, { skill, loadedAt: Date.now() });
    return skill;
  } catch (error) {
    logger.error("[DynamicRegistry] Failed to load skill:", {
      slug,
      tenantId,
      error,
    });
    return null;
  }
}

/**
 * Create an IModExecutor wrapper that routes calls through the sandbox
 */
function createSandboxExecutor(
  skill: GeneratedSkill,
  tenantId: string,
): IModExecutor {
  return {
    get slug() {
      return skill.slug as any;
    },

    async getData(tenant_id: string): Promise<Record<string, unknown>> {
      const context: SkillExecutionContext = {
        tenant_id,
        skill_id: skill.id,
        method: "getData",
        args: [],
      };
      const result = await executeInSandbox(context, skill.executor_code);
      await logExecution(context, result);

      if (!result.success) {
        return { error: result.error };
      }
      return result.result as Record<string, unknown>;
    },

    async getInsights(tenant_id: string): Promise<ModInsight[]> {
      const context: SkillExecutionContext = {
        tenant_id,
        skill_id: skill.id,
        method: "getInsights",
        args: [],
      };
      const result = await executeInSandbox(context, skill.executor_code);
      await logExecution(context, result);

      if (!result.success) {
        return [];
      }
      return result.result as ModInsight[];
    },

    async executeAction(
      tenant_id: string,
      action: string,
      params: Record<string, unknown>,
    ): Promise<{ success: boolean; result?: unknown; error?: string }> {
      const context: SkillExecutionContext = {
        tenant_id,
        skill_id: skill.id,
        method: "executeAction",
        args: [action, params],
      };
      const result = await executeInSandbox(context, skill.executor_code);
      await logExecution(context, result, action, params);

      if (!result.success) {
        return { success: false, error: result.error };
      }
      return result.result as {
        success: boolean;
        result?: unknown;
        error?: string;
      };
    },

    getActions(): ModAction[] {
      // getActions is synchronous and doesn't need sandbox execution
      // We can extract it at load time since it's pure data
      try {
        const context: SkillExecutionContext = {
          tenant_id: tenantId,
          skill_id: skill.id,
          method: "getActions",
          args: [],
        };
        // For getActions, we run it sync-ish by caching the result
        // This is called during tool registration, so we need it sync
        // Return empty for now, the async version will populate it
        return [];
      } catch {
        return [];
      }
    },
  };
}
