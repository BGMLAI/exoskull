// =====================================================
// VERSION MANAGER - Skill versioning and rollback
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { GeneratedSkill, SkillVersion } from "../types";
import { invalidateSkillCache } from "./dynamic-registry";

import { logger } from "@/lib/logger";
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Save current version before updating a skill.
 * Creates a version snapshot in exo_skill_versions.
 */
export async function saveVersion(
  skill: GeneratedSkill,
  changelog?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getServiceSupabase();

    const { error } = await supabase.from("exo_skill_versions").insert({
      skill_id: skill.id,
      version: skill.version,
      executor_code: skill.executor_code,
      config_schema: skill.config_schema,
      capabilities: skill.capabilities,
      changelog: changelog || null,
    });

    if (error) {
      logger.error("[VersionManager] Failed to save version:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error("[VersionManager] Error saving version:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Get all versions for a skill
 */
export async function getVersions(skillId: string): Promise<SkillVersion[]> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("exo_skill_versions")
      .select("*")
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("[VersionManager] Failed to fetch versions:", error);
      return [];
    }

    return (data || []) as SkillVersion[];
  } catch (error) {
    logger.error("[VersionManager] Error fetching versions:", error);
    return [];
  }
}

/**
 * Rollback a skill to a specific version.
 * Saves current state as a new version first, then restores the target.
 */
export async function rollbackToVersion(
  skillId: string,
  targetVersion: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getServiceSupabase();

    // Load current skill
    const { data: currentSkill, error: loadError } = await supabase
      .from("exo_generated_skills")
      .select("*")
      .eq("id", skillId)
      .single();

    if (loadError || !currentSkill) {
      return { success: false, error: "Skill not found" };
    }

    // Load target version
    const { data: targetVersionData, error: versionError } = await supabase
      .from("exo_skill_versions")
      .select("*")
      .eq("skill_id", skillId)
      .eq("version", targetVersion)
      .single();

    if (versionError || !targetVersionData) {
      return { success: false, error: `Version ${targetVersion} not found` };
    }

    // Save current state as a new version snapshot before rollback
    await saveVersion(
      currentSkill as GeneratedSkill,
      `Auto-saved before rollback to ${targetVersion}`,
    );

    // Bump version number
    const newVersion = incrementVersion(currentSkill.version);

    // Apply rollback
    const { error: updateError } = await supabase
      .from("exo_generated_skills")
      .update({
        executor_code: targetVersionData.executor_code,
        config_schema: targetVersionData.config_schema,
        capabilities: targetVersionData.capabilities,
        version: newVersion,
      })
      .eq("id", skillId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Invalidate cache
    invalidateSkillCache(currentSkill.slug, currentSkill.tenant_id);

    logger.info(
      `[VersionManager] Rolled back skill ${skillId} to version ${targetVersion} (now ${newVersion})`,
    );

    return { success: true };
  } catch (error) {
    logger.error("[VersionManager] Rollback error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Increment semantic version: 1.0.0 -> 1.0.1
 */
function incrementVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "1.0.1";
  parts[2] += 1;
  return parts.join(".");
}
