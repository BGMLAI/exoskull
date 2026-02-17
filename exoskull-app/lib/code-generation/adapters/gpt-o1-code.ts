/**
 * GPT-o1 Code Adapter
 * Phase 2: OpenAI o3-mini API (deep reasoning, 200K context)
 *
 * o3-mini: no system role, uses max_completion_tokens, no temperature.
 * Graceful fallback if no OPENAI_API_KEY.
 */

import type {
  CodeExecutor,
  CodeGenerationTask,
  CodeGenerationResult,
} from "../types";
import {
  buildCodeGenSystemPrompt,
  buildCodeGenUserPrompt,
} from "../prompts/code-gen-prompt";
import { parseCodeResponse } from "../response-parser";

import { logger } from "@/lib/logger";
export class GPTo1CodeAdapter implements CodeExecutor {
  model = "gpt-o1-code" as const;
  capabilities = {
    maxContextTokens: 200_000,
    supportsMultiFile: true,
    supportsGitOps: false,
    supportsDeploy: false,
  };

  private tenantId: string;
  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async execute(task: CodeGenerationTask): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        model: "gpt-o1-code",
        files: [],
        duration: Date.now() - startTime,
        error: "OPENAI_API_KEY not configured",
      };
    }

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey, timeout: 55000 });

      // o3-mini: no system role — merge into single user message
      const combined = `${buildCodeGenSystemPrompt()}\n\n---\n\n${buildCodeGenUserPrompt(task)}`;

      logger.info("[GPTo1Code] Generating:", {
        tenantId: this.tenantId,
        desc: task.description.slice(0, 80),
      });

      const response = await client.chat.completions.create({
        model: "o3-mini",
        messages: [{ role: "user", content: combined }],
        max_completion_tokens: 16384,
      });

      const content = response.choices[0]?.message?.content ?? "";
      if (!content) {
        return {
          success: false,
          model: "gpt-o1-code",
          files: [],
          duration: Date.now() - startTime,
          error: "Empty response",
        };
      }

      const parsed = parseCodeResponse(content);
      if (parsed.files.length === 0) {
        return {
          success: false,
          model: "gpt-o1-code",
          files: [],
          duration: Date.now() - startTime,
          error: "No parseable files",
        };
      }

      logger.info("[GPTo1Code] Generated:", {
        files: parsed.files.length,
        tokens: response.usage?.completion_tokens,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        model: "gpt-o1-code",
        files: parsed.files,
        duration: Date.now() - startTime,
        summary: parsed.summary,
        dependencies: parsed.dependencies,
      };
    } catch (error) {
      logger.error("[GPTo1Code] Failed:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        model: "gpt-o1-code",
        files: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async health(): Promise<"healthy" | "degraded" | "down"> {
    return process.env.OPENAI_API_KEY ? "healthy" : "down";
  }

  async stop(): Promise<void> {}
}
