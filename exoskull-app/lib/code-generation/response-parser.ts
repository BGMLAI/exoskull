import { logger } from "@/lib/logger";

/**
 * Code Generation Response Parser
 * Phase 2: Parse AI response into structured file array
 *
 * Strategy:
 * 1. Try JSON.parse (strip markdown fences first)
 * 2. Fallback: extract code blocks with file path annotations
 * 3. Validate output
 */

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
  operation: "create" | "modify" | "delete";
}

export interface ParsedCodeOutput {
  files: ParsedFile[];
  summary: string;
  dependencies: string[];
}

/**
 * Language detection from file extension
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".css": "css",
  ".scss": "css",
  ".sql": "sql",
  ".json": "json",
  ".md": "markdown",
  ".html": "html",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".py": "python",
  ".sh": "shell",
  ".env": "env",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || "text";
}

/**
 * Strip markdown code fences from around JSON.
 * Handles ```json ... ``` and ``` ... ```
 */
function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  // Remove leading ```json or ```
  if (s.startsWith("```")) {
    const firstNewline = s.indexOf("\n");
    if (firstNewline !== -1) {
      s = s.slice(firstNewline + 1);
    }
  }
  // Remove trailing ```
  if (s.endsWith("```")) {
    s = s.slice(0, -3).trimEnd();
  }
  return s;
}

/**
 * Validate a file path — no traversal, no absolute, not empty
 */
function isValidPath(p: string): boolean {
  if (!p || p.length === 0) return false;
  if (p.startsWith("/") || p.startsWith("\\")) return false;
  if (p.includes("..")) return false;
  if (p.includes("\\0")) return false;
  return true;
}

/**
 * Try to parse as JSON first.
 */
function tryJsonParse(raw: string): ParsedCodeOutput | null {
  try {
    const cleaned = stripMarkdownFences(raw);
    const parsed = JSON.parse(cleaned);

    if (!parsed.files || !Array.isArray(parsed.files)) {
      return null;
    }

    const files: ParsedFile[] = parsed.files
      .filter(
        (f: Record<string, unknown>) =>
          f.path &&
          typeof f.path === "string" &&
          f.content &&
          typeof f.content === "string",
      )
      .map((f: Record<string, unknown>) => ({
        path: String(f.path),
        content: String(f.content),
        language:
          typeof f.language === "string"
            ? f.language
            : detectLanguage(String(f.path)),
        operation:
          f.operation === "modify"
            ? ("modify" as const)
            : f.operation === "delete"
              ? ("delete" as const)
              : ("create" as const),
      }));

    return {
      files,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      dependencies: Array.isArray(parsed.dependencies)
        ? parsed.dependencies.map(String)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Fallback: extract files from markdown code blocks.
 * Looks for patterns like:
 *   ### src/app/page.tsx
 *   ```tsx
 *   // content
 *   ```
 */
function tryMarkdownExtract(raw: string): ParsedCodeOutput | null {
  const files: ParsedFile[] = [];

  // Pattern: file path header followed by code block
  const blockRegex =
    /(?:#{1,4}\s+)?([^\n]+\.[a-zA-Z]{1,10})\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match;

  while ((match = blockRegex.exec(raw)) !== null) {
    const path = match[1].trim().replace(/^`|`$/g, "");
    const content = match[2];

    if (path && content && isValidPath(path)) {
      files.push({
        path,
        content: content.trimEnd(),
        language: detectLanguage(path),
        operation: "create",
      });
    }
  }

  if (files.length === 0) return null;

  return {
    files,
    summary: "",
    dependencies: [],
  };
}

/**
 * Main parser: try JSON first, then markdown fallback.
 */
export function parseCodeResponse(raw: string): ParsedCodeOutput {
  // Try JSON first
  const jsonResult = tryJsonParse(raw);
  if (jsonResult && jsonResult.files.length > 0) {
    // Validate all paths
    jsonResult.files = jsonResult.files.filter((f) => isValidPath(f.path));
    // Remove empty content
    jsonResult.files = jsonResult.files.filter(
      (f) => f.content.trim().length > 0,
    );
    return jsonResult;
  }

  // Fallback: markdown extraction
  const mdResult = tryMarkdownExtract(raw);
  if (mdResult && mdResult.files.length > 0) {
    return mdResult;
  }

  // Nothing parseable
  logger.warn(
    "[ResponseParser] Could not parse AI response:",
    raw.slice(0, 200),
  );
  return { files: [], summary: "", dependencies: [] };
}

/**
 * Parse a modify response (simpler: just content + summary)
 */
export function parseModifyResponse(raw: string): {
  content: string;
  summary: string;
} | null {
  try {
    const cleaned = stripMarkdownFences(raw);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.content === "string") {
      return {
        content: parsed.content,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    }
  } catch {
    // Try extracting content from code block
    const blockMatch = raw.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    if (blockMatch) {
      return { content: blockMatch[1].trimEnd(), summary: "" };
    }
  }
  return null;
}
