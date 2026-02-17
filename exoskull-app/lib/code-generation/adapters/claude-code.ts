/**
 * Claude Code Adapter
 * Phase 2: API-based code generation via aiChat (Sonnet 4.5)
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
export class ClaudeCodeAdapter implements CodeExecutor {
  model = "claude-code" as const;

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

    try {
      const { aiChat } = await import("@/lib/ai");

      logger.info("[ClaudeCode] Generating code:", {
        tenantId: this.tenantId,
        description: task.description.slice(0, 80),
        requirements: task.requirements.length,
      });

      const response = await aiChat(
        [
          { role: "system", content: buildCodeGenSystemPrompt() },
          { role: "user", content: buildCodeGenUserPrompt(task) },
        ],
        {
          forceModel: "claude-sonnet-4-5",
          maxTokens: 16384,
          tenantId: this.tenantId,
          taskCategory: "analysis",
        },
      );

      const parsed = parseCodeResponse(response.content);

      if (parsed.files.length === 0) {
        logger.warn("[ClaudeCode] No files parsed from response:", {
          contentLength: response.content.length,
          preview: response.content.slice(0, 200),
        });
        return {
          success: false,
          model: "claude-code",
          files: [],
          duration: Date.now() - startTime,
          error: "AI returned no parseable files",
        };
      }

      logger.info("[ClaudeCode] Generated:", {
        files: parsed.files.length,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        model: "claude-code",
        files: parsed.files,
        duration: Date.now() - startTime,
        summary: parsed.summary,
        dependencies: parsed.dependencies,
      };
    } catch (error) {
      logger.error("[ClaudeCode] Execution failed:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId: this.tenantId,
        task: task.description.slice(0, 100),
      });

      return {
        success: false,
        model: "claude-code",
        files: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async health(): Promise<"healthy" | "degraded" | "down"> {
    return process.env.ANTHROPIC_API_KEY ? "healthy" : "down";
  }

  async stop(): Promise<void> {}
}
