/**
 * Code Executor Service — file operations, bash, git for the Code API.
 *
 * Operates on the host filesystem (mounted into Docker container).
 * All paths are validated through the sandbox middleware.
 */

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  resolveSafePath,
  validateCwd,
  sanitizeCommand,
} from "../middleware/sandbox";

const MAX_OUTPUT = 50_000; // 50KB max output
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file read

// ============================================================================
// FILE OPERATIONS
// ============================================================================

export interface ReadFileResult {
  content: string;
  lines: number;
  size: number;
}

export async function readFile(
  filePath: string,
  offset?: number,
  limit?: number,
): Promise<ReadFileResult> {
  const safePath = resolveSafePath(filePath);

  const stats = fs.statSync(safePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`,
    );
  }

  const content = fs.readFileSync(safePath, "utf-8");
  const allLines = content.split("\n");

  const startLine = offset || 0;
  const endLine = limit ? startLine + limit : allLines.length;
  const selectedLines = allLines.slice(startLine, endLine);

  // Add line numbers (cat -n format)
  const numbered = selectedLines
    .map((line, i) => `${String(startLine + i + 1).padStart(6)}\t${line}`)
    .join("\n");

  return {
    content: numbered,
    lines: allLines.length,
    size: stats.size,
  };
}

export async function writeFile(
  filePath: string,
  content: string,
): Promise<{ path: string; lines: number; size: number }> {
  const safePath = resolveSafePath(filePath);

  // Create parent directories
  fs.mkdirSync(path.dirname(safePath), { recursive: true });
  fs.writeFileSync(safePath, content, "utf-8");

  const stats = fs.statSync(safePath);
  return {
    path: filePath,
    lines: content.split("\n").length,
    size: stats.size,
  };
}

export async function editFile(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll?: boolean,
): Promise<{ path: string; replacements: number }> {
  const safePath = resolveSafePath(filePath);

  let content = fs.readFileSync(safePath, "utf-8");

  if (!content.includes(oldString)) {
    throw new Error(
      `old_string not found in ${filePath}. Make sure the string matches exactly (including whitespace).`,
    );
  }

  let replacements = 0;

  if (replaceAll) {
    while (content.includes(oldString)) {
      content = content.replace(oldString, newString);
      replacements++;
      if (replacements > 1000) break; // Safety limit
    }
  } else {
    // Check uniqueness
    const firstIndex = content.indexOf(oldString);
    const secondIndex = content.indexOf(oldString, firstIndex + 1);
    if (secondIndex !== -1) {
      throw new Error(
        `old_string is not unique in ${filePath} (found ${content.split(oldString).length - 1} occurrences). Provide more context or use replace_all.`,
      );
    }
    content = content.replace(oldString, newString);
    replacements = 1;
  }

  fs.writeFileSync(safePath, content, "utf-8");
  return { path: filePath, replacements };
}

// ============================================================================
// BASH EXECUTION
// ============================================================================

export interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export async function executeBash(
  command: string,
  cwd?: string,
  timeoutMs = 30_000,
): Promise<BashResult> {
  sanitizeCommand(command);
  const safeCwd = validateCwd(cwd);
  const start = Date.now();

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: safeCwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        shell: "/bin/bash",
        env: {
          ...process.env,
          HOME: "/root",
          PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/bin",
        },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: String(stdout).slice(0, MAX_OUTPUT),
          stderr: String(stderr).slice(0, MAX_OUTPUT),
          exit_code: error ? (error as { code?: number }).code || 1 : 0,
          duration_ms: Date.now() - start,
        });
      },
    );
  });
}

// ============================================================================
// GLOB (file search)
// ============================================================================

export async function globFiles(
  pattern: string,
  cwd?: string,
): Promise<string[]> {
  const safeCwd = validateCwd(cwd);

  // Use find command with pattern matching
  const { stdout } = await executeBash(
    `find . -path './.git' -prune -o -path './node_modules' -prune -o -name '${pattern.replace(/'/g, "\\'")}' -print 2>/dev/null | head -500`,
    safeCwd,
    10_000,
  );

  if (!stdout.trim()) {
    // Try with full glob via bash
    const { stdout: globOut } = await executeBash(
      `shopt -s globstar nullglob; printf '%s\\n' ${pattern} 2>/dev/null | head -500`,
      safeCwd,
      10_000,
    );
    return globOut.trim() ? globOut.trim().split("\n") : [];
  }

  return stdout
    .trim()
    .split("\n")
    .filter((f) => f.length > 0);
}

// ============================================================================
// GREP (content search)
// ============================================================================

export interface GrepResult {
  matches: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  total: number;
}

export async function grepFiles(
  pattern: string,
  searchPath?: string,
  options?: { ignore_case?: boolean; max_results?: number },
): Promise<GrepResult> {
  const safeCwd = validateCwd(searchPath);
  const maxResults = options?.max_results || 100;
  const caseFlag = options?.ignore_case ? "-i" : "";

  // Use grep (or rg if available)
  const { stdout } = await executeBash(
    `grep -rn ${caseFlag} --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.py --include=*.md --include=*.json --include=*.yaml --include=*.yml --include=*.toml --include=*.css --include=*.html --include=*.sql --include=*.sh --include=*.txt --include=*.xml --include=*.go --include=*.rs --include=*.rb --include=*.php --include=*.java --include=*.c --include=*.cpp --include=*.h -m ${maxResults} '${pattern.replace(/'/g, "\\'")}' . 2>/dev/null | head -${maxResults}`,
    safeCwd,
    10_000,
  );

  if (!stdout.trim()) {
    return { matches: [], total: 0 };
  }

  const matches = stdout
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
      if (!match) return null;
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        content: match[3].slice(0, 200),
      };
    })
    .filter(Boolean) as GrepResult["matches"];

  return { matches, total: matches.length };
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

export async function gitOperation(
  operation: string,
  cwd: string,
): Promise<BashResult> {
  const safeCwd = validateCwd(cwd);

  // Whitelist safe git operations
  const ALLOWED_OPS = [
    "status",
    "diff",
    "log",
    "branch",
    "add",
    "commit",
    "push",
    "pull",
    "fetch",
    "stash",
    "checkout",
    "merge",
    "rebase",
    "remote",
    "show",
    "rev-parse",
    "ls-files",
    "tag",
  ];

  const opName = operation.trim().split(/\s+/)[0];
  if (!ALLOWED_OPS.includes(opName)) {
    throw new Error(
      `Git operation '${opName}' not allowed. Allowed: ${ALLOWED_OPS.join(", ")}`,
    );
  }

  // Block destructive git operations
  if (/--force|--hard|-D\s/.test(operation) && !operation.includes("--force-with-lease")) {
    throw new Error("Destructive git operations (--force, --hard, -D) are blocked");
  }

  return executeBash(`git ${operation}`, safeCwd, 30_000);
}

// ============================================================================
// FETCH URL
// ============================================================================

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ExoSkull-Agent/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (contentType.includes("text/html")) {
    // Strip scripts, styles, and HTML tags — keep text content
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);
  }

  return text.slice(0, 50_000);
}

// ============================================================================
// TREE (directory structure)
// ============================================================================

export async function getTree(
  dirPath: string,
  depth = 3,
): Promise<string> {
  const safePath = validateCwd(dirPath);

  // Try tree command first (run from within the safe path)
  const { stdout, exit_code } = await executeBash(
    `tree -L ${depth} --charset=ascii -I 'node_modules|.git|__pycache__|.next|dist|build' . 2>/dev/null`,
    safePath,
    10_000,
  );

  if (exit_code === 0 && stdout.trim()) {
    return stdout.slice(0, MAX_OUTPUT);
  }

  // Fallback: find-based tree
  const { stdout: findOut } = await executeBash(
    `find . -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' | sort | head -500`,
    safePath,
    10_000,
  );

  return findOut.slice(0, MAX_OUTPUT);
}
