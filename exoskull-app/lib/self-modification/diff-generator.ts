/**
 * Diff Generator — AI-powered code modification generation.
 *
 * Generates code diffs using AI with full codebase context.
 * Supports retry with error injection from failed attempts.
 * Uses aiChat with taskCategory "code_generation" for optimal model routing.
 */

import { aiChat } from "@/lib/ai";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface DiffRequest {
  description: string;
  targetFiles: Array<{ path: string; currentContent: string }>;
  relatedFiles: Array<{ path: string; content: string }>;
  previousAttempts?: string[];
}

export interface DiffResult {
  files: Array<{
    path: string;
    action: "create" | "modify" | "delete";
    content: string;
    diff?: string;
  }>;
  reasoning: string;
  confidence: number;
}

// ============================================================================
// MAIN
// ============================================================================

const MAX_RETRIES = 3;

/**
 * Generate code modifications using AI with full codebase context.
 * Retries up to 3 times, injecting previous error messages for learning.
 */
export async function generateDiff(request: DiffRequest): Promise<DiffResult> {
  const attempts: string[] = [...(request.previousAttempts || [])];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await callAIForDiff(request, attempts);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      attempts.push(`Attempt ${attempt + 1} failed: ${errMsg}`);

      logger.warn("[DiffGenerator] Attempt failed:", {
        attempt: attempt + 1,
        error: errMsg,
      });

      if (attempt === MAX_RETRIES - 1) {
        throw new Error(
          `Diff generation failed after ${MAX_RETRIES} attempts: ${errMsg}`,
        );
      }
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Diff generation failed");
}

// ============================================================================
// AI CALL
// ============================================================================

async function callAIForDiff(
  request: DiffRequest,
  previousAttempts: string[],
): Promise<DiffResult> {
  const targetFilesContext = request.targetFiles
    .map(
      (f) =>
        `### ${f.path}\n\`\`\`typescript\n${f.currentContent.slice(0, 8000)}\n\`\`\``,
    )
    .join("\n\n");

  const relatedFilesContext = request.relatedFiles
    .slice(0, 5)
    .map(
      (f) =>
        `### ${f.path}\n\`\`\`typescript\n${f.content.slice(0, 4000)}\n\`\`\``,
    )
    .join("\n\n");

  const retryContext =
    previousAttempts.length > 0
      ? `\n## Previous Failed Attempts\n${previousAttempts.map((a) => `- ${a}`).join("\n")}\n\nFix the issues from previous attempts.\n`
      : "";

  const systemPrompt = `You are a senior TypeScript engineer modifying an ExoSkull codebase (Next.js + Supabase).

RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation outside JSON
2. Preserve existing code patterns and imports
3. Never modify kernel-protected files
4. Never use eval, require, process.env, child_process, fs.write in generated code
5. Follow existing naming conventions (camelCase for vars, PascalCase for types)
6. Add proper error handling with logger.error()
7. Use existing imports (aiChat, getServiceSupabase, logger, etc.)
8. For new files: include all necessary imports
9. For modifications: return the FULL new file content (not just the diff)

Response format:
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "action": "create" | "modify" | "delete",
      "content": "full file content here",
      "diff": "human-readable summary of changes"
    }
  ],
  "reasoning": "why these changes solve the problem",
  "confidence": 0.0-1.0
}`;

  const userPrompt = `## Task
${request.description}

## Target Files (current content)
${targetFilesContext || "No existing files — creating new files."}

## Related Files (for context)
${relatedFilesContext || "No related files provided."}
${retryContext}
Generate the code modifications.`;

  const response = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      taskCategory: "code_generation",
      maxTokens: 8000,
      temperature: 0.1,
    },
  );

  // Parse response
  let content = response.content.trim();
  // Strip markdown fences if present
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(content);

  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error("AI response missing 'files' array");
  }

  return {
    files: parsed.files.map((f: Record<string, unknown>) => ({
      path: f.path as string,
      action: (f.action as "create" | "modify" | "delete") || "modify",
      content: (f.content as string) || "",
      diff: f.diff as string | undefined,
    })),
    reasoning: (parsed.reasoning as string) || "",
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
  };
}
