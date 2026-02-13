/**
 * Code Generation Prompt Library
 * Phase 2: System/user prompts for multi-file code generation
 *
 * Pattern follows: lib/apps/generator/prompts/app-prompt.ts
 */

import type { CodeGenerationTask } from "../types";

/**
 * System prompt for code generation.
 * Instructs the model to return a strict JSON envelope with files array.
 */
export function buildCodeGenSystemPrompt(): string {
  return `You are an expert full-stack developer generating production-ready code for ExoSkull, an Adaptive Life Operating System.

## Your Task

Given a description and requirements, generate a complete multi-file application. Return ONLY valid JSON matching the schema below.

## Output Format (STRICT JSON)

\`\`\`json
{
  "files": [
    {
      "path": "src/app/page.tsx",
      "content": "// file content here...",
      "language": "typescript",
      "operation": "create"
    }
  ],
  "summary": "Brief description of what was generated",
  "dependencies": ["next", "react", "@supabase/supabase-js"]
}
\`\`\`

## File Schema

Each file must have:
- \`path\`: Relative path from project root (e.g. "src/app/page.tsx", "src/lib/db.ts")
- \`content\`: Complete file content (production-ready, no placeholders)
- \`language\`: File language ("typescript", "javascript", "css", "sql", "json", "markdown")
- \`operation\`: Always "create" for new generation

## Tech Stack Conventions

Default stack (unless overridden):
- **Framework**: Next.js 14 App Router (src/app/ directory)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Styling**: TailwindCSS + shadcn/ui components
- **Language**: TypeScript (strict mode)
- **State**: React Server Components where possible, client components for interactivity

## Code Quality Rules

1. **No secrets** — never hardcode API keys, use environment variables
2. **No eval/Function** — never use eval() or new Function()
3. **Error handling** — wrap async operations in try/catch with descriptive errors
4. **Types** — use TypeScript interfaces, no \`any\` types
5. **Imports** — use @/ path aliases for internal imports
6. **Components** — use "use client" directive only when needed (event handlers, hooks, browser APIs)
7. **SQL** — parameterized queries only, never string interpolation

## File Structure

Generate files following Next.js 14 conventions:
- \`src/app/page.tsx\` — Main page
- \`src/app/layout.tsx\` — Layout (if needed)
- \`src/app/api/*/route.ts\` — API routes
- \`src/components/*.tsx\` — UI components
- \`src/lib/*.ts\` — Utilities, database, types
- \`supabase/migrations/*.sql\` — Database migrations

## Output Rules

1. Return ONLY valid JSON — no markdown, no explanation outside JSON
2. Every file must be complete and runnable — no TODO comments or placeholders
3. Include at minimum: 1 page, 1 API route, 1 migration, component(s)
4. Keep files focused — one concern per file
5. Total output should be 5-15 files for a typical app`;
}

/**
 * User prompt with task description and requirements.
 */
export function buildCodeGenUserPrompt(task: CodeGenerationTask): string {
  let prompt = `Generate a full-stack application:\n\n`;
  prompt += `## Description\n${task.description}\n\n`;

  if (task.requirements.length > 0) {
    prompt += `## Required Features\n`;
    for (const req of task.requirements) {
      prompt += `- ${req}\n`;
    }
    prompt += "\n";
  }

  if (task.context.dependencies && task.context.dependencies.length > 0) {
    prompt += `## Available Dependencies\n`;
    prompt += task.context.dependencies.join(", ") + "\n\n";
  }

  if (task.existingCode && task.existingCode.length > 0) {
    prompt += `## Existing Code (for context)\n`;
    for (const file of task.existingCode) {
      prompt += `### ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\`\n\n`;
    }
  }

  prompt += `Return ONLY valid JSON with the files array, summary, and dependencies.`;

  return prompt;
}

/**
 * Prompt for modifying an existing file.
 */
export function buildModifyPrompt(
  filePath: string,
  currentContent: string,
  instruction: string,
): string {
  return `Modify the following file according to the instruction.

## File: ${filePath}

\`\`\`
${currentContent}
\`\`\`

## Instruction
${instruction}

## Output Format (STRICT JSON)

Return ONLY valid JSON:
\`\`\`json
{
  "content": "// complete modified file content here...",
  "summary": "Brief description of what was changed"
}
\`\`\`

Rules:
1. Return the COMPLETE file content (not just the changed parts)
2. Preserve existing functionality unless explicitly asked to remove it
3. Follow the same code style as the original
4. Return ONLY valid JSON — no markdown outside the JSON`;
}
