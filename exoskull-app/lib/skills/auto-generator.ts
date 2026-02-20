/**
 * Skill Auto-Generator
 *
 * Bridges the gap between skill detection and skill generation.
 * Reads pending suggestions from DB, generates skills, and auto-approves low-risk ones.
 *
 * Called from: /api/cron/skill-auto-generator (daily @ 4 AM)
 */

import { createClient } from "@supabase/supabase-js";
import { generateSkill } from "./generator/skill-generator";
import { initiateApproval } from "./approval/approval-gateway";
import { updateSuggestionStatus } from "./detector";
import { invalidateDynamicToolCache } from "@/lib/iors/tools/dynamic-handler";
import type { SkillGenerationRequest } from "./types";
import { logger } from "@/lib/logger";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// CONFIG
// ============================================================================

const MAX_SKILLS_PER_RUN = 3;
const MIN_CONFIDENCE = 0.75;
const AUTO_APPROVE_RISK_THRESHOLD = "low" as const;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export interface AutoGeneratorResult {
  processed: number;
  generated: number;
  autoApproved: number;
  sentForApproval: number;
  failed: number;
  errors: string[];
}

/**
 * Process pending skill suggestions and auto-generate skills.
 *
 * Flow:
 * 1. Fetch pending suggestions with confidence >= threshold
 * 2. For each: generate skill code via AI
 * 3. Low-risk + smoke test passed → auto-approve + register as tool
 * 4. Medium/high-risk → send approval request via SMS/email
 * 5. Mark suggestion as processed
 */
export async function autoGenerateSkills(
  tenantId?: string,
): Promise<AutoGeneratorResult> {
  const supabase = getServiceSupabase();
  const result: AutoGeneratorResult = {
    processed: 0,
    generated: 0,
    autoApproved: 0,
    sentForApproval: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Fetch pending suggestions
    let query = supabase
      .from("exo_skill_suggestions")
      .select("*")
      .eq("status", "pending")
      .gte("confidence", MIN_CONFIDENCE)
      .order("confidence", { ascending: false })
      .limit(MAX_SKILLS_PER_RUN);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: suggestions, error } = await query;

    if (error) {
      logger.error("[SkillAutoGenerator] Failed to fetch suggestions:", {
        error: error.message,
      });
      result.errors.push(`DB fetch failed: ${error.message}`);
      return result;
    }

    if (!suggestions || suggestions.length === 0) {
      logger.info("[SkillAutoGenerator] No pending suggestions to process");
      return result;
    }

    logger.info(
      `[SkillAutoGenerator] Processing ${suggestions.length} suggestions`,
    );

    // 2. Process each suggestion
    for (const suggestion of suggestions) {
      result.processed++;

      try {
        // Map suggestion source to generation source
        const sourceMap: Record<string, SkillGenerationRequest["source"]> = {
          request_parse: "user_request",
          pattern_match: "pattern_match",
          gap_detection: "gap_detection",
        };

        // Generate skill
        const genResult = await generateSkill({
          tenant_id: suggestion.tenant_id,
          description: suggestion.description,
          source: sourceMap[suggestion.source] || "pattern_match",
          model: "auto",
        });

        if (!genResult.success || !genResult.skill) {
          logger.warn("[SkillAutoGenerator] Generation failed:", {
            suggestion_id: suggestion.id,
            error: genResult.error,
            validationErrors: genResult.validationErrors,
          });
          result.failed++;
          result.errors.push(
            `${suggestion.id}: ${genResult.error || "generation failed"}`,
          );
          // Mark suggestion as failed (don't retry)
          await supabase
            .from("exo_skill_suggestions")
            .update({
              status: "failed",
              dismissed_at: new Date().toISOString(),
            })
            .eq("id", suggestion.id);
          continue;
        }

        result.generated++;
        const skill = genResult.skill;

        // Link suggestion to generated skill
        await updateSuggestionStatus(suggestion.id, "generated", skill.id);

        // 3. Auto-approve low-risk skills
        if (skill.risk_level === AUTO_APPROVE_RISK_THRESHOLD) {
          // Auto-approve: update status directly
          const { error: approveError } = await supabase
            .from("exo_generated_skills")
            .update({
              approval_status: "approved",
              approved_at: new Date().toISOString(),
              approved_by: "auto-generator",
              updated_at: new Date().toISOString(),
            })
            .eq("id", skill.id);

          if (approveError) {
            logger.error("[SkillAutoGenerator] Auto-approve failed:", {
              skill_id: skill.id,
              error: approveError.message,
            });
            result.failed++;
            continue;
          }

          // Register as dynamic tool
          await registerAsDynamicTool(supabase, skill);
          result.autoApproved++;

          logger.info("[SkillAutoGenerator] Auto-approved skill:", {
            skill_id: skill.id,
            slug: skill.slug,
            risk_level: skill.risk_level,
          });
        } else {
          // 4. Medium/high-risk → send for approval
          const approvalResult = await initiateApproval(skill);

          if (approvalResult.success) {
            result.sentForApproval++;
            logger.info("[SkillAutoGenerator] Sent for approval:", {
              skill_id: skill.id,
              slug: skill.slug,
              risk_level: skill.risk_level,
            });
          } else {
            logger.error("[SkillAutoGenerator] Approval initiation failed:", {
              skill_id: skill.id,
              error: approvalResult.error,
            });
            result.failed++;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("[SkillAutoGenerator] Processing error:", {
          suggestion_id: suggestion.id,
          error: errorMsg,
        });
        result.failed++;
        result.errors.push(`${suggestion.id}: ${errorMsg}`);
      }
    }

    logger.info("[SkillAutoGenerator] Run complete:", result);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[SkillAutoGenerator] Fatal error:", { error: errorMsg });
    result.errors.push(`Fatal: ${errorMsg}`);
    return result;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function registerAsDynamicTool(
  _supabase: any,
  skill: {
    id: string;
    tenant_id: string;
    slug: string;
    name: string;
    description: string | null;
  },
): Promise<void> {
  // Use fresh service client to avoid type mismatch
  const db = getServiceSupabase();
  const { error } = await db.from("exo_dynamic_tools").upsert(
    {
      tenant_id: skill.tenant_id,
      name: `skill_${skill.slug}`,
      description: skill.description || skill.name,
      handler_type: "skill_exec",
      handler_config: { skill_id: skill.id },
      is_active: true,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "tenant_id,name" },
  );

  if (error) {
    logger.error("[SkillAutoGenerator] Dynamic tool registration failed:", {
      skill_id: skill.id,
      error: error.message,
    });
    return;
  }

  // Invalidate cache so the tool is available immediately
  invalidateDynamicToolCache(skill.tenant_id);
}
