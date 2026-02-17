/**
 * Code Execution IORS Tools — Edit files, run commands, use git on VPS.
 *
 * These tools call the VPS Code API (/api/code/*) to perform
 * file operations, bash commands, and git operations on the VPS.
 *
 * Tools:
 * - code_read_file    — Read a file from VPS
 * - code_write_file   — Write/create a file on VPS
 * - code_edit_file    — Edit a file (old_string → new_string)
 * - code_bash         — Execute bash command on VPS
 * - code_glob         — Search files by pattern
 * - code_grep         — Search content in files
 * - code_git          — Git operations (status, commit, push, etc.)
 * - code_tree         — Directory structure
 * - code_web_search   — Brave Search API for docs/code/solutions
 * - code_web_fetch    — Fetch URL content via VPS
 * - code_deploy       — Deploy to Vercel via git push
 * - code_list_skills  — List available skills from ~/.claude/skills/
 * - code_load_skill   — Load a skill's SKILL.md instructions
 * - code_load_agent   — Load an agent definition from ~/.claude/agents/
 */

import type { ToolDefinition } from "./shared";
import { logger } from "@/lib/logger";

// ============================================================================
// VPS CODE API CLIENT
// ============================================================================

async function callVPSCodeAPI(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<string> {
  const url = process.env.VPS_EXECUTOR_URL;
  const secret = process.env.VPS_EXECUTOR_SECRET;

  if (!url || !secret) {
    return "VPS executor nie skonfigurowany. Ustaw VPS_EXECUTOR_URL i VPS_EXECUTOR_SECRET w .env.";
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json();

    if (!response.ok) {
      return `Blad VPS (${response.status}): ${data.error || JSON.stringify(data)}`;
    }

    return JSON.stringify(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CodeExecTools] VPS API call failed:", {
      endpoint,
      error: msg,
    });
    return `Blad polaczenia z VPS: ${msg}`;
  }
}

// ============================================================================
// TOOLS
// ============================================================================

export const codeExecutionTools: ToolDefinition[] = [
  // ---- code_read_file ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "code_read_file",
      description: `Read a file from the VPS project directory.
Returns file content with line numbers. Use offset/limit for large files.
Files are in /root/projects/ on the VPS.`,
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description:
              "Absolute path to the file (e.g., /root/projects/myapp/src/index.ts)",
          },
          offset: {
            type: "number",
            description: "Start reading from this line number (0-based)",
          },
          limit: {
            type: "number",
            description: "Number of lines to read",
          },
        },
        required: ["file_path"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const filePath = input.file_path as string;
      logger.info("[CodeExecTools] code_read_file:", { filePath });

      const result = await callVPSCodeAPI("/api/code/read", {
        file_path: filePath,
        offset: input.offset,
        limit: input.limit,
      });

      // Parse and format for readability
      try {
        const data = JSON.parse(result);
        if (data.success) {
          return `Plik: ${filePath} (${data.lines} linii, ${data.size} bajtow)\n\n${data.content}`;
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_write_file ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "code_write_file",
      description: `Write or create a file on the VPS.
Creates parent directories automatically. Overwrites existing files.
Use code_read_file first to check if the file exists.`,
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path for the file",
          },
          content: {
            type: "string",
            description: "File content to write",
          },
        },
        required: ["file_path", "content"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const filePath = input.file_path as string;
      const content = input.content as string;
      logger.info("[CodeExecTools] code_write_file:", {
        filePath,
        contentLength: content.length,
      });

      const result = await callVPSCodeAPI("/api/code/write", {
        file_path: filePath,
        content,
      });

      try {
        const data = JSON.parse(result);
        if (data.success) {
          return `Zapisano: ${filePath} (${data.lines} linii, ${data.size} bajtow)`;
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_edit_file ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "code_edit_file",
      description: `Edit a file on the VPS by replacing a specific string.
The old_string must be unique in the file (unless replace_all is true).
Always read the file first with code_read_file to get the exact string to replace.`,
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the file",
          },
          old_string: {
            type: "string",
            description: "Exact string to find and replace",
          },
          new_string: {
            type: "string",
            description: "Replacement string",
          },
          replace_all: {
            type: "boolean",
            description: "Replace all occurrences (default: false)",
          },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const filePath = input.file_path as string;
      logger.info("[CodeExecTools] code_edit_file:", { filePath });

      const result = await callVPSCodeAPI("/api/code/edit", {
        file_path: filePath,
        old_string: input.old_string,
        new_string: input.new_string,
        replace_all: input.replace_all,
      });

      try {
        const data = JSON.parse(result);
        if (data.success) {
          return `Edytowano: ${filePath} (${data.replacements} zamian)`;
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_bash ----
  {
    timeoutMs: 55_000,
    definition: {
      name: "code_bash",
      description: `Execute a bash command on the VPS.
Use for: npm install, running scripts, checking processes, etc.
Commands run in /root/projects/ by default. Max timeout: 60s.
Dangerous commands (rm -rf /, shutdown, etc.) are blocked.`,
      input_schema: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "Bash command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory (default: /root/projects/)",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default: 30000, max: 60000)",
          },
        },
        required: ["command"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const command = input.command as string;
      const cwd = input.cwd as string | undefined;
      logger.info("[CodeExecTools] code_bash:", { command, cwd });

      const result = await callVPSCodeAPI("/api/code/bash", {
        command,
        cwd,
        timeout_ms: input.timeout_ms,
      });

      try {
        const data = JSON.parse(result);
        let output = "";
        if (data.stdout?.trim()) {
          output += data.stdout.trim();
        }
        if (data.stderr?.trim()) {
          output += (output ? "\n\n" : "") + "STDERR:\n" + data.stderr.trim();
        }
        if (!output) {
          output = data.success
            ? "(command completed with no output)"
            : `Exit code: ${data.exit_code}`;
        }
        const status = data.success ? "OK" : `FAILED (exit ${data.exit_code})`;
        return `[${status}] ${command}\n${data.duration_ms}ms\n\n${output}`;
      } catch {
        return result;
      }
    },
  },

  // ---- code_glob ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "code_glob",
      description: `Search for files by name pattern on the VPS.
Uses glob patterns (e.g., "*.ts", "*.tsx", "package.json").
Excludes node_modules and .git directories.`,
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description:
              "File name pattern to search for (e.g., '*.ts', 'README*')",
          },
          cwd: {
            type: "string",
            description: "Directory to search in (default: /root/projects/)",
          },
        },
        required: ["pattern"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const pattern = input.pattern as string;
      logger.info("[CodeExecTools] code_glob:", { pattern });

      const result = await callVPSCodeAPI("/api/code/glob", {
        pattern,
        cwd: input.cwd,
      });

      try {
        const data = JSON.parse(result);
        if (data.success) {
          if (data.count === 0) return `Brak plikow pasujacych do: ${pattern}`;
          return `Znaleziono ${data.count} plikow:\n${data.files.join("\n")}`;
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_grep ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "code_grep",
      description: `Search for text/regex pattern in file contents on the VPS.
Returns matching lines with file paths and line numbers.
Searches common file types (ts, js, py, md, json, etc.).`,
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Text or regex pattern to search for",
          },
          path: {
            type: "string",
            description: "Directory to search in (default: /root/projects/)",
          },
          ignore_case: {
            type: "boolean",
            description: "Case-insensitive search (default: false)",
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (default: 100)",
          },
        },
        required: ["pattern"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const pattern = input.pattern as string;
      logger.info("[CodeExecTools] code_grep:", { pattern });

      const result = await callVPSCodeAPI("/api/code/grep", {
        pattern,
        path: input.path,
        ignore_case: input.ignore_case,
        max_results: input.max_results,
      });

      try {
        const data = JSON.parse(result);
        if (data.success) {
          if (data.total === 0) return `Brak wynikow dla: ${pattern}`;
          const lines = data.matches
            .map(
              (m: { file: string; line: number; content: string }) =>
                `${m.file}:${m.line}: ${m.content}`,
            )
            .join("\n");
          return `Znaleziono ${data.total} wynikow:\n${lines}`;
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_git ----
  {
    timeoutMs: 30_000,
    definition: {
      name: "code_git",
      description: `Execute git operations on a repository on the VPS.
Supports: status, diff, log, branch, add, commit, push, pull, fetch, stash, checkout, merge, remote, show, tag.
Destructive operations (--force, --hard, -D) are blocked.`,
      input_schema: {
        type: "object" as const,
        properties: {
          operation: {
            type: "string",
            description:
              "Git operation (e.g., 'status', 'log --oneline -10', 'add .', 'commit -m \"fix bug\"')",
          },
          cwd: {
            type: "string",
            description: "Path to the git repository on VPS",
          },
        },
        required: ["operation", "cwd"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const operation = input.operation as string;
      const cwd = input.cwd as string;
      logger.info("[CodeExecTools] code_git:", { operation, cwd });

      const result = await callVPSCodeAPI("/api/code/git", {
        operation,
        cwd,
      });

      try {
        const data = JSON.parse(result);
        let output = "";
        if (data.stdout?.trim()) output += data.stdout.trim();
        if (data.stderr?.trim())
          output += (output ? "\n" : "") + data.stderr.trim();
        if (!output)
          output = data.success ? "(no output)" : `Exit: ${data.exit_code}`;
        return `git ${operation}\n${output}`;
      } catch {
        return result;
      }
    },
  },

  // ---- code_tree ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "code_tree",
      description: `Show directory structure (tree view) on the VPS.
Excludes node_modules, .git, __pycache__, .next, dist, build.
Useful for understanding project layout.`,
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Directory path (default: /root/projects/)",
          },
          depth: {
            type: "number",
            description: "Max depth (default: 3)",
          },
        },
        required: [],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const dirPath = (input.path as string) || "/root/projects";
      logger.info("[CodeExecTools] code_tree:", { path: dirPath });

      const result = await callVPSCodeAPI("/api/code/tree", {
        path: dirPath,
        depth: input.depth,
      });

      try {
        const data = JSON.parse(result);
        if (data.success) {
          return data.tree || "(empty directory)";
        }
        return result;
      } catch {
        return result;
      }
    },
  },

  // ---- code_web_search ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "code_web_search",
      description: `Search the web for documentation, APIs, code examples, solutions.
Uses Brave Search API. Returns top 10 results with titles, URLs, and descriptions.`,
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const query = input.query as string;
      logger.info("[CodeExecTools] code_web_search:", { query });

      const key = process.env.BRAVE_API_KEY;
      if (!key) return "Brave Search API key not configured (BRAVE_API_KEY).";

      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
          {
            headers: {
              "X-Subscription-Token": key,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(8_000),
          },
        );

        if (!res.ok) {
          return `Brave Search error: ${res.status} ${res.statusText}`;
        }

        const data = await res.json();
        const results = data.web?.results;
        if (!results || results.length === 0) return "Brak wynikow.";

        return results
          .map(
            (r: { title: string; url: string; description: string }) =>
              `**${r.title}**\n${r.url}\n${r.description}`,
          )
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[CodeExecTools] code_web_search failed:", { error: msg });
        return `Web search error: ${msg}`;
      }
    },
  },

  // ---- code_web_fetch ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "code_web_fetch",
      description: `Fetch a URL and return content as text. Use for docs, APIs, web pages.
HTML is stripped to plain text. Max 30KB for HTML, 50KB for other content.`,
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL to fetch",
          },
        },
        required: ["url"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const url = input.url as string;
      logger.info("[CodeExecTools] code_web_fetch:", { url });

      return callVPSCodeAPI("/api/code/fetch", { url });
    },
  },

  // ---- code_deploy ----
  {
    timeoutMs: 30_000,
    definition: {
      name: "code_deploy",
      description: `Deploy exoskull to Vercel production by pushing to main.
Triggers Vercel auto-deploy. Use after making and committing code changes.`,
      input_schema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "Deploy description (for logging)",
          },
        },
        required: ["message"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const message = input.message as string;
      logger.info("[CodeExecTools] code_deploy:", { message });

      return callVPSCodeAPI("/api/code/bash", {
        command: "cd /root/projects/exoskull && git push origin main",
        timeout_ms: 25000,
      });
    },
  },

  // ---- code_list_skills ----
  {
    timeoutMs: 5_000,
    definition: {
      name: "code_list_skills",
      description: `List available skills from ~/.claude/skills/. Returns skill directory names.
Skills contain SKILL.md with specialized methodologies (TDD, security audit, etc.).`,
      input_schema: {
        type: "object" as const,
        properties: {
          filter: {
            type: "string",
            description:
              "Optional filter pattern (e.g., 'security', 'tdd', 'debug')",
          },
        },
        required: [],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const filter = input.filter as string | undefined;
      logger.info("[CodeExecTools] code_list_skills:", { filter });

      const command = filter
        ? `ls /root/.claude/skills/ | grep -i '${filter.replace(/'/g, "")}'`
        : "ls /root/.claude/skills/";

      return callVPSCodeAPI("/api/code/bash", {
        command,
        cwd: "/root",
      });
    },
  },

  // ---- code_load_skill ----
  {
    timeoutMs: 5_000,
    definition: {
      name: "code_load_skill",
      description: `Load a skill's SKILL.md instructions. Use to learn specialized methodologies.
First use code_list_skills to find available skills, then load the one you need.`,
      input_schema: {
        type: "object" as const,
        properties: {
          skill_name: {
            type: "string",
            description:
              "Skill directory name (e.g., 'tdd-guide', 'security-audit')",
          },
        },
        required: ["skill_name"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const skillName = input.skill_name as string;
      logger.info("[CodeExecTools] code_load_skill:", { skillName });

      return callVPSCodeAPI("/api/code/read", {
        file_path: `/root/.claude/skills/${skillName}/SKILL.md`,
      });
    },
  },

  // ---- code_load_agent ----
  {
    timeoutMs: 5_000,
    definition: {
      name: "code_load_agent",
      description: `Load an agent definition from ~/.claude/agents/. Agents have specialized roles (architect, debugger, tester, etc.).
Use to adopt an agent's persona and methodology for the current task.`,
      input_schema: {
        type: "object" as const,
        properties: {
          agent_name: {
            type: "string",
            description:
              "Agent filename without .md (e.g., 'architect', 'debugger', 'tester-qa')",
          },
        },
        required: ["agent_name"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const agentName = input.agent_name as string;
      logger.info("[CodeExecTools] code_load_agent:", { agentName });

      return callVPSCodeAPI("/api/code/read", {
        file_path: `/root/.claude/agents/${agentName}.md`,
      });
    },
  },
];
