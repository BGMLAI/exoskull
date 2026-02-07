// =====================================================
// SKILL GENERATOR - AI-powered code generation
// Uses Claude Opus to generate IModExecutor implementations
// =====================================================

import { aiChat } from "@/lib/ai";
import {
  buildExecutorPrompt,
  buildUserPrompt,
} from "./prompts/executor-prompt";
import { analyzeCode } from "../validator/static-analyzer";
import { validateSchema } from "../validator/schema-validator";
import {
  auditSkillCode,
  extractCapabilities,
  classifyRiskLevel,
} from "../validator/security-auditor";
import {
  GeneratedSkill,
  SkillGenerationRequest,
  SkillGenerationResult,
  SecurityAuditResult,
  SkillGeneratorModel,
} from "../types";
import type { TaskCategory, ModelId } from "@/lib/ai/types";
import { runSmokeTest } from "../verification/smoke-test";
import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
const MAX_GENERATION_RETRIES = 3;

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Generate a new skill from a natural language description.
 * Full pipeline: AI generation -> static analysis -> schema validation -> security audit -> DB insert
 */
export async function generateSkill(
  request: SkillGenerationRequest,
): Promise<SkillGenerationResult> {
  const { tenant_id, description } = request;

  let lastError: string | null = null;
  let lastValidationErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_RETRIES; attempt++) {
    try {
      // Step 1: Generate code via AI (using chosen model)
      const code = await generateCode(
        description,
        lastValidationErrors,
        request.model,
      );

      if (!code || code.trim().length === 0) {
        lastError = "AI returned empty code";
        continue;
      }

      // Step 2: Static analysis (blocked patterns)
      const staticResult = analyzeCode(code);
      if (!staticResult.passed) {
        lastError = "Static analysis failed";
        lastValidationErrors = staticResult.blockedPatterns.map(
          (p) => p.pattern,
        );
        console.error(
          "[SkillGenerator] Static analysis failed:",
          staticResult.blockedPatterns,
        );
        continue;
      }

      // Step 3: Schema validation (IModExecutor compliance)
      const schemaResult = validateSchema(code);
      if (!schemaResult.valid) {
        lastError = "Schema validation failed";
        lastValidationErrors = schemaResult.errors;
        console.error(
          "[SkillGenerator] Schema validation failed:",
          schemaResult.errors,
        );
        continue;
      }

      // Step 4: Extract capabilities and audit
      const capabilities = extractCapabilities(code);
      const riskLevel = classifyRiskLevel(capabilities);
      const securityAudit = auditSkillCode(code, capabilities);

      if (!securityAudit.passed) {
        lastError = "Security audit failed";
        lastValidationErrors = securityAudit.blockedPatterns;
        console.error("[SkillGenerator] Security audit failed:", securityAudit);
        continue;
      }

      // Step 5: Generate metadata
      const slug =
        schemaResult.detectedSlug || `custom-${slugify(description)}`;
      const name = generateName(description);

      // Step 5.5: Smoke test — run getActions() + getData() in sandbox
      const smokeResult = await runSmokeTest(code, tenant_id, "pre-insert");
      if (!smokeResult.passed) {
        lastError = "Smoke test failed — generated code crashes at runtime";
        lastValidationErrors = smokeResult.errors;
        console.error(
          "[SkillGenerator] Smoke test failed:",
          smokeResult.errors,
        );
        continue;
      }

      logger.info(
        `[SkillGenerator] Smoke test passed (${smokeResult.durationMs}ms)`,
      );

      // Step 6: Store in database
      const modelUsed = resolveModelName(request.model);
      const supabase = getServiceSupabase();
      const { data: skill, error: insertError } = await supabase
        .from("exo_generated_skills")
        .insert({
          tenant_id,
          slug,
          name,
          description,
          version: "1.0.0",
          tier: "custom",
          executor_code: code,
          config_schema: {},
          capabilities,
          allowed_tools: buildAllowedTools(capabilities),
          risk_level: riskLevel,
          generation_prompt: description,
          generated_by: modelUsed,
          approval_status: "pending",
          security_audit: {
            ...securityAudit,
            smokeTestPassed: true,
            smokeTestDurationMs: smokeResult.durationMs,
          },
          last_audit_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("[SkillGenerator] DB insert error:", insertError);
        return {
          success: false,
          error: `Database error: ${insertError.message}`,
        };
      }

      logger.info(
        `[SkillGenerator] Skill generated: ${slug} (attempt ${attempt})`,
      );

      return {
        success: true,
        skill: skill as GeneratedSkill,
      };
    } catch (error) {
      lastError = (error as Error).message;
      console.error(`[SkillGenerator] Attempt ${attempt} failed:`, error);
    }
  }

  return {
    success: false,
    error: `Failed after ${MAX_GENERATION_RETRIES} attempts: ${lastError}`,
    validationErrors: lastValidationErrors,
  };
}

/**
 * Resolve the model name for DB storage from the user's choice.
 */
function resolveModelName(model?: SkillGeneratorModel): string {
  switch (model) {
    case "codex":
      return "openai-codex";
    case "gemini-flash":
      return "gemini-flash";
    case "claude-sonnet":
      return "claude-sonnet-4-5";
    case "auto":
    default:
      return "auto-routed";
  }
}

/**
 * Map SkillGeneratorModel to AI router options.
 */
function getModelOptions(model?: SkillGeneratorModel): {
  taskCategory?: TaskCategory;
  forceModel?: ModelId;
} {
  switch (model) {
    case "codex":
      // Codex not yet in ModelId union — cast until added
      return { forceModel: "openai-codex" as ModelId };
    case "gemini-flash":
      return { forceModel: "gemini-1.5-flash" };
    case "claude-sonnet":
      return { forceModel: "claude-sonnet-4-5" };
    case "auto":
    default:
      return { taskCategory: "code_generation" };
  }
}

/**
 * Call AI to generate IModExecutor code
 */
async function generateCode(
  description: string,
  previousErrors: string[],
  model?: SkillGeneratorModel,
): Promise<string> {
  const systemPrompt = buildExecutorPrompt();
  let userPrompt = buildUserPrompt(description);

  // If retrying, include the errors from previous attempt
  if (previousErrors.length > 0) {
    userPrompt += `\n\nIMPORTANT: Your previous attempt had these errors. Fix them:\n${previousErrors.map((e) => `- ${e}`).join("\n")}`;
  }

  const modelOptions = getModelOptions(model);
  const response = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      ...modelOptions,
      maxTokens: 8192,
    },
  );

  // Clean up the response - remove markdown code blocks if present
  let code = response.content;
  code = code.replace(/^```(?:typescript|ts)?\n?/m, "");
  code = code.replace(/\n?```\s*$/m, "");
  code = code.trim();

  return code;
}

/**
 * Generate a human-readable name from the description
 */
function generateName(description: string): string {
  // Simple heuristic: capitalize first letter, truncate at 50 chars
  const cleaned = description.trim();
  const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return name.length > 50 ? name.slice(0, 47) + "..." : name;
}

/**
 * Generate a URL-safe slug from description
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 40)
    .replace(/-$/, "");
}

/**
 * Build allowed tools list based on capabilities
 */
function buildAllowedTools(capabilities: {
  database: string[];
  tables: string[];
}): string[] {
  const tools: string[] = [];

  if (capabilities.database.includes("read")) {
    tools.push(
      "supabase.select",
      "supabase.eq",
      "supabase.order",
      "supabase.limit",
      "supabase.single",
    );
  }

  if (capabilities.database.includes("write")) {
    tools.push("supabase.insert", "supabase.update");
  }

  return tools;
}
