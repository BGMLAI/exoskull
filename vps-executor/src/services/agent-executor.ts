/**
 * Agent Executor — VPS-native coding agent runner
 *
 * Uses DeepSeek V3 (primary) + Groq Llama 3.3 70B (fallback)
 * via OpenAI-compatible API. No Anthropic dependency.
 *
 * - Tools call local filesystem functions directly (zero network overhead)
 * - Emits SSE events for file_change, diff_view
 * - In-memory session store for multi-turn conversations
 *
 * Config: deepseek-chat (primary), 15 turns, 120s timeout
 */

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

// OpenAI-compatible message types
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
}

interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface SessionState {
  messages: ChatMessage[];
  workspaceDir: string;
  createdAt: number;
  lastActiveAt: number;
}

// ============================================================================
// CONFIG
// ============================================================================

const CODING_CONFIG = {
  maxTurns: 15,
  timeoutMs: 120_000,
  maxTokens: 8192,
};

const MAX_TOOL_RESULT_LENGTH = 50_000;

// Provider cascade: DeepSeek V3 (primary) → Groq (fallback)
const PROVIDERS = [
  {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    timeoutMs: 90_000,
  },
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
    timeoutMs: 30_000,
  },
] as const;

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
// TOOL DEFINITIONS (OpenAI function calling format)
// ============================================================================

const AGENT_TOOLS: FunctionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the workspace. Returns content with line numbers.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path relative to workspace root" },
          offset: { type: "number", description: "Start line (0-indexed)" },
          limit: { type: "number", description: "Number of lines to read" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or create a file in the workspace.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path relative to workspace root" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing old_string with new_string. The old_string must be unique in the file.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path relative to workspace root" },
          old_string: { type: "string", description: "Exact string to find and replace" },
          new_string: { type: "string", description: "Replacement string" },
          replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a bash command in the workspace directory.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
          timeout_ms: { type: "number", description: "Timeout in ms (max 60000)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Search for files by name pattern in the workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "File name pattern (e.g. *.ts, *.tsx)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents by regex pattern in the workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          ignore_case: { type: "boolean", description: "Case insensitive search" },
          max_results: { type: "number", description: "Max results (default 100)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git",
      description: "Run a git operation in the workspace (status, diff, log, add, commit, push, etc.).",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", description: "Git operation (e.g. 'status', 'diff', 'log --oneline -10')" },
        },
        required: ["operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tree",
      description: "Show directory structure of the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Subdirectory path (default: workspace root)" },
          depth: { type: "number", description: "Max depth (default: 3)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL (for documentation, APIs, etc.).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "Search the user's uploaded knowledge base (documents, notes, PDFs). Returns relevant chunks with similarity scores.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List the user's uploaded documents in the knowledge base.",
      parameters: {
        type: "object",
        properties: {},
      },
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

  if (firstDiff === -1) return [];

  const contextLines = 3;
  const hunkStart = Math.max(0, firstDiff - contextLines);
  const hunkEndBefore = Math.min(beforeLines.length - 1, (lastDiffBefore === -1 ? firstDiff : lastDiffBefore) + contextLines);
  const hunkEndAfter = Math.min(afterLines.length - 1, (lastDiffAfter === -1 ? firstDiff : lastDiffAfter) + contextLines);

  const lines: Array<{ type: "context" | "add" | "remove"; content: string }> = [];

  for (let i = hunkStart; i < firstDiff; i++) {
    lines.push({ type: "context", content: beforeLines[i] || "" });
  }

  for (let i = firstDiff; i <= (lastDiffBefore === -1 ? firstDiff : lastDiffBefore); i++) {
    if (i < beforeLines.length) {
      lines.push({ type: "remove", content: beforeLines[i] });
    }
  }

  for (let i = firstDiff; i <= (lastDiffAfter === -1 ? firstDiff : lastDiffAfter); i++) {
    if (i < afterLines.length) {
      lines.push({ type: "add", content: afterLines[i] });
    }
  }

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

const EXOSKULL_API_URL = process.env.EXOSKULL_API_URL || "https://exoskull.xyz";
const VPS_AGENT_SECRET = process.env.VPS_EXECUTOR_SECRET;

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspaceDir: string,
  emit: SSECallback,
  tenantId?: string,
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

      case "search_knowledge": {
        if (!tenantId) return { result: "No tenant context available", isError: true };
        const res = await fetch(`${EXOSKULL_API_URL}/api/internal/knowledge-search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${VPS_AGENT_SECRET}`,
          },
          body: JSON.stringify({
            tenantId,
            query: input.query as string,
            limit: (input.limit as number) || 5,
          }),
        });
        if (!res.ok) return { result: `Knowledge search failed: HTTP ${res.status}`, isError: true };
        const data = (await res.json()) as { results?: unknown[] };
        return { result: JSON.stringify(data.results || [], null, 2), isError: false };
      }

      case "list_documents": {
        if (!tenantId) return { result: "No tenant context available", isError: true };
        const res = await fetch(
          `${EXOSKULL_API_URL}/api/internal/knowledge-documents?tenantId=${encodeURIComponent(tenantId)}`,
          {
            headers: { Authorization: `Bearer ${VPS_AGENT_SECRET}` },
          },
        );
        if (!res.ok) return { result: `Document list failed: HTTP ${res.status}`, isError: true };
        const data = (await res.json()) as { documents?: unknown[] };
        return { result: JSON.stringify(data.documents || [], null, 2), isError: false };
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
- fetch_url: Fetch web content
- search_knowledge: Search user's uploaded documents/notes (use when user asks about their files)
- list_documents: List user's uploaded documents in knowledge base`;
}

// ============================================================================
// AI PROVIDER
// ============================================================================

function getProvider(): { name: string; baseUrl: string; model: string; apiKey: string; timeoutMs: number } {
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey];
    if (key) {
      return { name: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: key, timeoutMs: p.timeoutMs };
    }
  }
  throw new Error("[AgentExecutor] No AI provider configured. Set DEEPSEEK_API_KEY or GROQ_API_KEY.");
}

/**
 * Call OpenAI-compatible chat completions API (DeepSeek / Groq).
 */
async function callChatAPI(
  provider: { baseUrl: string; model: string; apiKey: string },
  messages: ChatMessage[],
  tools: FunctionTool[],
  maxTokens: number,
  signal: AbortSignal,
): Promise<{
  content: string;
  toolCalls: ToolCallMessage[] | null;
  finishReason: string;
}> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = (errBody as Record<string, Record<string, string>>)?.error?.message
      || `${response.status} ${response.statusText}`;
    throw new Error(`API error ${response.status}: ${errMsg}`);
  }

  const data = await response.json();
  const choice = (data as Record<string, unknown[]>).choices?.[0] as Record<string, unknown> | undefined;
  const message = choice?.message as Record<string, unknown> | undefined;

  return {
    content: (message?.content as string) || "",
    toolCalls: Array.isArray(message?.tool_calls) && (message!.tool_calls as unknown[]).length > 0
      ? message!.tool_calls as ToolCallMessage[]
      : null,
    finishReason: (choice?.finish_reason as string) || "stop",
  };
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

  // Add user message to session
  session.messages.push({ role: "user", content: req.message });

  emit({ type: "session", sessionId, workspaceDir });
  emit({ type: "status", status: "processing" });

  const provider = getProvider();
  const systemPrompt = buildSystemPrompt(workspaceDir);

  console.log(`[AgentExecutor] Using ${provider.name} (${provider.model})`);

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    CODING_CONFIG.timeoutMs,
  );

  let numTurns = 0;
  let finalText = "";
  const toolsUsed: string[] = [];

  try {
    // Build API messages: system + session history
    const apiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...session.messages,
    ];

    while (numTurns < CODING_CONFIG.maxTurns) {
      numTurns++;

      const result = await callChatAPI(
        provider,
        apiMessages,
        AGENT_TOOLS,
        CODING_CONFIG.maxTokens,
        abortController.signal,
      );

      // Emit text content
      if (result.content) {
        emit({ type: "delta", text: result.content });
      }

      // No tool calls — done
      if (!result.toolCalls) {
        finalText = result.content;
        break;
      }

      // Add assistant message with tool calls to API messages
      apiMessages.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls,
      });

      // Execute each tool call and add results
      for (const tc of result.toolCalls) {
        const toolName = tc.function.name;
        if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }

        emit({ type: "tool_start", tool: toolName });
        const startMs = Date.now();

        const { result: toolResult, isError } = await executeTool(
          toolName,
          args,
          workspaceDir,
          emit,
          req.tenantId,
        );

        const durationMs = Date.now() - startMs;
        emit({
          type: "tool_end",
          tool: toolName,
          durationMs,
          success: !isError,
          resultSummary: toolResult.slice(0, 200),
        });

        // Truncate long results
        const truncated = toolResult.length > MAX_TOOL_RESULT_LENGTH
          ? toolResult.slice(0, MAX_TOOL_RESULT_LENGTH) + `\n\n[Truncated — ${toolResult.length} chars total]`
          : toolResult;

        // OpenAI format: each tool result is a separate message
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: truncated,
        });
      }
    }

    // Max turns reached
    if (!finalText && numTurns >= CODING_CONFIG.maxTurns) {
      finalText = "Max interaction limit reached. Try a simpler request.";
    }

    // Update session with final assistant message (text only)
    session.messages.push({ role: "assistant", content: finalText });

    // Keep session history bounded (last 20 messages — reduced from 40)
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
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
    provider: provider.name,
  });
}
