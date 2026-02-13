/**
 * Kimi Code Adapter
 * Phase 2: Kimi K2.5 API (1M+ token context)
 * Auth: KIMI_API_KEY env var. Graceful fallback if no key.
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

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

export class KimiCodeAdapter implements CodeExecutor {
  model = "kimi-code" as const;
  capabilities = {
    maxContextTokens: 1_000_000,
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
    const apiKey = process.env.KIMI_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        model: "kimi-code",
        files: [],
        duration: Date.now() - startTime,
        error: "KIMI_API_KEY not configured",
      };
    }

    try {
      let userContent = buildCodeGenUserPrompt(task);
      if (task.existingCode && task.existingCode.length > 0) {
        userContent += "\n\n## Existing Files:\n";
        for (const f of task.existingCode) {
          userContent += `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n\n`;
        }
      }

      console.log("[KimiCode] Generating:", {
        tenantId: this.tenantId,
        desc: task.description.slice(0, 80),
      });

      const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "kimi-k2.5",
          messages: [
            { role: "system", content: buildCodeGenSystemPrompt() },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 32768,
          thinking: { type: "enabled" },
        }),
        signal: AbortSignal.timeout(55000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          (err as Record<string, Record<string, string>>)?.error?.message ||
          `${res.status} ${res.statusText}`;
        console.error("[KimiCode] API error:", msg);
        return {
          success: false,
          model: "kimi-code",
          files: [],
          duration: Date.now() - startTime,
          error: `Kimi API: ${msg}`,
        };
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content) {
        return {
          success: false,
          model: "kimi-code",
          files: [],
          duration: Date.now() - startTime,
          error: "Empty response",
        };
      }

      const parsed = parseCodeResponse(content);
      if (parsed.files.length === 0) {
        return {
          success: false,
          model: "kimi-code",
          files: [],
          duration: Date.now() - startTime,
          error: "No parseable files",
        };
      }

      console.log("[KimiCode] Generated:", {
        files: parsed.files.length,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        model: "kimi-code",
        files: parsed.files,
        duration: Date.now() - startTime,
        summary: parsed.summary,
        dependencies: parsed.dependencies,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      console.error("[KimiCode] Failed:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        model: "kimi-code",
        files: [],
        duration: Date.now() - startTime,
        error: isTimeout
          ? "Timed out (55s)"
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  async health(): Promise<"healthy" | "degraded" | "down"> {
    const k = process.env.KIMI_API_KEY;
    if (!k) return "down";
    try {
      const r = await fetch(`${KIMI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${k}` },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok ? "healthy" : "degraded";
    } catch {
      return "degraded";
    }
  }

  async stop(): Promise<void> {}
}
