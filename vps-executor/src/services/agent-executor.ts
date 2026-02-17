/**
 * Agent Executor — VPS-native coding agent runner
 *
 * Mirrors exoskull-app/lib/agent-sdk/exoskull-agent.ts pattern but:
 * - Tools call local filesystem functions directly (zero network overhead)
 * - Emits SSE events for file_change, diff_view
 * - In-memory session store for multi-turn conversations
 *
 * Config: claude-sonnet-4-5-20250929, 25 turns, 120s timeout
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  readFile,
  writeFile,
  editFile,
  executeBash,
  globFiles,
  grepFiles,
  gitOperation,
  getTree,
} from "./code-executor";

// Local fetchUrl — VPS code-executor.ts doesn't export one
async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
}
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentCodeRequest {
  tenantId: string;
  sessionId?: string;
  message: string;
  isAdmin: boolean;
}

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export type SSECallback = (event: SSEEvent) => void;

interface SessionState {
  messages: Anthropic.MessageParam[];
  workspaceDir: string;
  createdAt: number;
  lastActiveAt: number;
}

// ============================================================================
// CONFIG
// ============================================================================

const CODING_CONFIG = {
  maxTurns: 25,
  timeoutMs: 120_000,
  model: "claude-sonnet-4-5-20250929" as const,
  maxTokens: 8192,
};

const MAX_TOOL_RESULT_LENGTH = 50_000;

// ============================================================================
// SESSION STORE (in-memory)
// ============================================================================

const sessions = new Map<string, SessionState>();

// Evict sessions older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastActiveAt < cutoff) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ============================================================================
// WORKSPACE
// ============================================================================

export function resolveWorkspaceDir(tenantId: string, isAdmin: boolean): string {
  if (isAdmin) {
    return "/root/projects/exoskull";
  }
  return `/root/projects/users/${tenantId}`;
}

export function ensureWorkspaceDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// TOOL DEFINITIONS (Anthropic API format)
// ============================================================================

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read a file from the workspace. Returns content with line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path relative to workspace root" },
        offset: { type: "number", description: "Start line (0-indexed)" },
        limit: { type: "number", description: "Number of lines to read" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file in the workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path relative to workspace root" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing old_string with new_string. The old_string must be unique in the file.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path relative to workspace root" },
        old_string: { type: "string", description: "Exact string to find and replace" },
        new_string: { type: "string", description: "Replacement string" },
        replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "bash",
    description: "Execute a bash command in the workspace directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The bash command to execute" },
        timeout_ms: { type: "number", description: "Timeout in ms (max 60000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "glob",
    description: "Search for files by name pattern in the workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "File name pattern (e.g. *.ts, *.tsx)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents by regex pattern in the workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        ignore_case: { type: "boolean", description: "Case insensitive search" },
        max_results: { type: "number", description: "Max results (default 100)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "git",
    description: "Run a git operation in the workspace (status, diff, log, add, commit, push, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Git operation (e.g. 'status', 'diff', 'log --oneline -10')" },
      },
      required: ["operation"],
    },
  },
  {
    name: "tree",
    description: "Show directory structure of the workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Subdirectory path (default: workspace root)" },
        depth: { type: "number", description: "Max depth (default: 3)" },
      },
    },
  },
  {
    name: "fetch_url",
    description: "Fetch content from a URL (for documentation, APIs, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
];

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".py": "python", ".rs": "rust", ".go": "go", ".java": "java",
    ".css": "css", ".html": "html", ".json": "json", ".md": "markdown",
    ".sql": "sql", ".sh": "bash", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".xml": "xml", ".rb": "ruby", ".php": "php",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
  };
  return langMap[ext] || "text";
}

function computeDiffHunks(before: string, after: string): Array<{
  oldStart: number;
  newStart: number;
  lines: Array<{ type: "context" | "add" | "remove"; content: string }>;
}> {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const hunks: Array<{
    oldStart: number;
    newStart: number;
    lines: Array<{ type: "context" | "add" | "remove"; content: string }>;
  }> = [];

  // Simple line-by-line diff — find first and last differing lines
  let firstDiff = -1;
  let lastDiffBefore = -1;
  let lastDiffAfter = -1;
  const maxLen = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      if (firstDiff === -1) firstDiff = i;
      if (i < beforeLines.length) lastDiffBefore = i;
      if (i < afterLines.length) lastDiffAfter = i;
    }
  }

  if (firstDiff === -1) return []; // No diff

  // Build a single hunk with context
  const contextLines = 3;
  const hunkStart = Math.max(0, firstDiff - contextLines);
  const hunkEndBefore = Math.min(beforeLines.length - 1, (lastDiffBefore === -1 ? firstDiff : lastDiffBefore) + contextLines);
  const hunkEndAfter = Math.min(afterLines.length - 1, (lastDiffAfter === -1 ? firstDiff : lastDiffAfter) + contextLines);

  const lines: Array<{ type: "context" | "add" | "remove"; content: string }> = [];

  // Context before
  for (let i = hunkStart; i < firstDiff; i++) {
    lines.push({ type: "context", content: beforeLines[i] || "" });
  }

  // Removed lines
  for (let i = firstDiff; i <= (lastDiffBefore === -1 ? firstDiff : lastDiffBefore); i++) {
    if (i < beforeLines.length) {
      lines.push({ type: "remove", content: beforeLines[i] });
    }
  }

  // Added lines
  for (let i = firstDiff; i <= (lastDiffAfter === -1 ? firstDiff : lastDiffAfter); i++) {
    if (i < afterLines.length) {
      lines.push({ type: "add", content: afterLines[i] });
    }
  }

  // Context after
  const contextStart = Math.max(
    lastDiffBefore === -1 ? firstDiff + 1 : lastDiffBefore + 1,
    lastDiffAfter === -1 ? firstDiff + 1 : lastDiffAfter + 1,
  );
  const contextEnd = Math.max(hunkEndBefore, hunkEndAfter);
  for (let i = contextStart; i <= contextEnd; i++) {
    const line = afterLines[i] ?? beforeLines[i] ?? "";
    lines.push({ type: "context", content: line });
  }

  hunks.push({
    oldStart: hunkStart + 1,
    newStart: hunkStart + 1,
    lines,
  });

  return hunks;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspaceDir: string,
  emit: SSECallback,
): Promise<{ result: string; isError: boolean }> {
  try {
    const resolve = (p: string) => {
      if (!p) return workspaceDir;
      if (path.isAbsolute(p)) return p;
      return path.join(workspaceDir, p);
    };

    switch (name) {
      case "read_file": {
        const filePath = resolve(input.file_path as string);
        const result = await readFile(filePath, input.offset as number | undefined, input.limit as number | undefined);
        return { result: JSON.stringify(result), isError: false };
      }

      case "write_file": {
        const filePath = resolve(input.file_path as string);
        const content = input.content as string;
        const result = await writeFile(filePath, content);
        emit({
          type: "file_change",
          filePath: input.file_path as string,
          language: getLanguageFromPath(filePath),
          operation: fs.existsSync(filePath) ? "edit" : "create",
        });
        return { result: JSON.stringify(result), isError: false };
      }

      case "edit_file": {
        const filePath = resolve(input.file_path as string);
        // Read before for diff
        let before = "";
        try {
          before = fs.readFileSync(filePath, "utf-8");
        } catch { /* file might not exist */ }

        const result = await editFile(
          filePath,
          input.old_string as string,
          input.new_string as string,
          input.replace_all as boolean | undefined,
        );

        // Read after for diff
        const after = fs.readFileSync(filePath, "utf-8");
        const hunks = computeDiffHunks(before, after);

        emit({
          type: "file_change",
          filePath: input.file_path as string,
          language: getLanguageFromPath(filePath),
          operation: "edit",
        });

        if (hunks.length > 0) {
          emit({
            type: "diff_view",
            filePath: input.file_path as string,
            before: before.slice(0, 5000),
            after: after.slice(0, 5000),
            hunks,
          });
        }

        return { result: JSON.stringify(result), isError: false };
      }

      case "bash": {
        const result = await executeBash(
          input.command as string,
          workspaceDir,
          Math.min((input.timeout_ms as number) || 30_000, 60_000),
        );
        return { result: JSON.stringify(result), isError: result.exit_code !== 0 };
      }

      case "glob": {
        const files = await globFiles(input.pattern as string, workspaceDir);
        return { result: JSON.stringify({ files, count: files.length }), isError: false };
      }

      case "grep": {
        const result = await grepFiles(input.pattern as string, workspaceDir, {
          ignore_case: input.ignore_case as boolean | undefined,
          max_results: input.max_results as number | undefined,
        });
        return { result: JSON.stringify(result), isError: false };
      }

      case "git": {
        const result = await gitOperation(input.operation as string, workspaceDir);
        return { result: JSON.stringify(result), isError: result.exit_code !== 0 };
      }

      case "tree": {
        const dir = input.path ? resolve(input.path as string) : workspaceDir;
        const result = await getTree(dir, (input.depth as number) || 3);
        return { result, isError: false };
      }

      case "fetch_url": {
        const content = await fetchUrl(input.url as string);
        return { result: content, isError: false };
      }

      default:
        return { result: `Unknown tool: ${name}`, isError: true };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[AgentExecutor] Tool ${name} failed:`, msg);
    return { result: `Error: ${msg}`, isError: true };
  }
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspaceDir: string): string {
  return `You are a coding agent with full access to the workspace at ${workspaceDir}.

You can read, write, and edit files, run bash commands, search code, use git, and browse documentation.

## Guidelines
- Read files before editing them
- Use edit_file for targeted changes (old_string → new_string)
- Use write_file only for new files or complete rewrites
- Run tests after changes when applicable
- Commit with descriptive messages
- Keep responses concise and focused

## Available Tools
- read_file: Read file contents
- write_file: Create or overwrite files
- edit_file: Make targeted edits (find & replace)
- bash: Run shell commands
- glob: Search files by name pattern
- grep: Search file contents
- git: Git operations
- tree: Show directory structure
- fetch_url: Fetch web content`;
}

// ============================================================================
// MAIN AGENT RUNNER
// ============================================================================

export async function runAgentCode(
  req: AgentCodeRequest,
  emit: SSECallback,
): Promise<void> {
  const workspaceDir = resolveWorkspaceDir(req.tenantId, req.isAdmin);
  ensureWorkspaceDir(workspaceDir);

  // Session management
  const sessionId = req.sessionId || `${req.tenantId}-${Date.now()}`;
  let session = sessions.get(sessionId);

  if (!session) {
    session = {
      messages: [],
      workspaceDir,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    sessions.set(sessionId, session);
  }

  session.lastActiveAt = Date.now();

  // Add user message
  session.messages.push({ role: "user", content: req.message });

  // Emit session event
  emit({ type: "session", sessionId, workspaceDir });
  emit({ type: "status", status: "processing" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt(workspaceDir);

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    CODING_CONFIG.timeoutMs,
  );

  let numTurns = 0;
  let finalText = "";
  const toolsUsed: string[] = [];

  try {
    // Copy messages for the API call (keep session.messages as canonical)
    const messages = [...session.messages];

    while (numTurns < CODING_CONFIG.maxTurns) {
      numTurns++;

      const stream = client.messages.stream(
        {
          model: CODING_CONFIG.model,
          max_tokens: CODING_CONFIG.maxTokens,
          system: systemPrompt,
          messages,
          tools: AGENT_TOOLS,
        },
        { signal: abortController.signal },
      );

      // Stream text deltas
      stream.on("text", (text) => {
        emit({ type: "delta", text });
      });

      const response = await stream.finalMessage();

      // Separate text and tool_use blocks
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
        }
      }

      // No tool calls — done
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        finalText = textParts.join("");
        break;
      }

      // Add assistant response to history
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const toolName = toolUse.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

          emit({ type: "tool_start", tool: toolName });
          const startMs = Date.now();

          const { result, isError } = await executeTool(
            toolName,
            toolUse.input as Record<string, unknown>,
            workspaceDir,
            emit,
          );

          const durationMs = Date.now() - startMs;
          emit({
            type: "tool_end",
            tool: toolName,
            durationMs,
            success: !isError,
            resultSummary: result.slice(0, 200),
          });

          // Truncate long results
          const truncated = result.length > MAX_TOOL_RESULT_LENGTH
            ? result.slice(0, MAX_TOOL_RESULT_LENGTH) + `\n\n[Truncated — ${result.length} chars total]`
            : result;

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: truncated,
            ...(isError ? { is_error: true as const } : {}),
          };
        }),
      );

      messages.push({ role: "user", content: toolResults });
    }

    // Max turns reached
    if (!finalText && numTurns >= CODING_CONFIG.maxTurns) {
      finalText = "Max interaction limit reached. Try a simpler request.";
    }

    // Update session with final assistant message
    session.messages.push({ role: "assistant", content: finalText });

    // Keep session history bounded (last 40 messages)
    if (session.messages.length > 40) {
      session.messages = session.messages.slice(-40);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (abortController.signal.aborted) {
      finalText = "Request timed out. Try a simpler request.";
      emit({ type: "error", message: "Timeout after 120s" });
    } else {
      console.error("[AgentExecutor] API call failed:", msg);
      finalText = "An error occurred. Please try again.";
      emit({ type: "error", message: msg });
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  emit({
    type: "done",
    fullText: finalText,
    toolsUsed,
    numTurns,
  });
}
