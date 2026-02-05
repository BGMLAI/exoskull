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
} from "../types";
import { createClient } from "@supabase/supabase-js";

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
  const { tenant_id, description, source } = request;

  let lastError: string | null = null;
  let lastValidationErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_RETRIES; attempt++) {
    try {
      // Step 1: Generate code via AI
      const code = await generateCode(description, lastValidationErrors);

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

      // Step 6: Store in database
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
          generated_by: "claude-opus-4-5",
          approval_status: "pending",
          security_audit: securityAudit,
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

      console.log(
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
 * Call AI to generate IModExecutor code
 */
async function generateCode(
  description: string,
  previousErrors: string[],
): Promise<string> {
  const systemPrompt = buildExecutorPrompt();
  let userPrompt = buildUserPrompt(description);

  // If retrying, include the errors from previous attempt
  if (previousErrors.length > 0) {
    userPrompt += `\n\nIMPORTANT: Your previous attempt had these errors. Fix them:\n${previousErrors.map((e) => `- ${e}`).join("\n")}`;
  }

  const response = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { forceTier: 4 }, // Claude Opus for code generation
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
