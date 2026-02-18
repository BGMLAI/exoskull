/**
 * Seed 60+ Commands → exo_commands
 *
 * Reads all .md files from ~/.claude/commands/ and upserts
 * into Supabase exo_commands table.
 *
 * Usage: npx tsx scripts/seed-commands.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSupabase, capitalize, batchUpsert } from "./seed-helpers";

// ── Category mapping ──
const CATEGORY_MAP: Record<string, string> = {
  brainstorm: "workflow",
  "execute-plan": "workflow",
  "write-plan": "workflow",
  "feature-development": "dev",
  "full-stack-feature": "dev",
  "data-driven-feature": "dev",
  "api-scaffold": "dev",
  "api-mock": "dev",
  "code-explain": "dev",
  "code-migrate": "dev",
  "refactor-clean": "dev",
  "legacy-modernize": "dev",
  "db-migrate": "dev",
  "k8s-manifest": "ops",
  "docker-optimize": "ops",
  "deploy-checklist": "ops",
  "monitor-setup": "ops",
  "slo-implement": "ops",
  "incident-response": "ops",
  "tdd-cycle": "testing",
  "tdd-red": "testing",
  "tdd-green": "testing",
  "tdd-refactor": "testing",
  "test-harness": "testing",
  "smart-debug": "testing",
  "debug-trace": "testing",
  "error-trace": "testing",
  "error-analysis": "testing",
  "security-scan": "testing",
  "security-hardening": "testing",
  "compliance-check": "testing",
  "deps-audit": "testing",
  "deps-upgrade": "ops",
  "doc-generate": "workflow",
  "full-review": "workflow",
  "ai-review": "ai",
  "ai-assistant": "ai",
  "prompt-optimize": "ai",
  "langchain-agent": "ai",
  "ml-pipeline": "ai",
  "multi-agent-optimize": "ai",
  "multi-agent-review": "ai",
  "improve-agent": "ai",
  "smart-fix": "dev",
  "standup-notes": "workflow",
  "pr-enhance": "dev",
  "git-workflow": "dev",
  "cost-optimize": "ops",
  "config-validate": "ops",
  "context-save": "workflow",
  "context-restore": "workflow",
  "data-pipeline": "dev",
  "data-validation": "dev",
  "performance-optimization": "dev",
  "tech-debt": "dev",
  "workflow-automate": "workflow",
  "multi-platform": "dev",
  onboard: "workflow",
  issue: "workflow",
  "accessibility-audit": "testing",
};

function extractDescription(md: string): string {
  // Try to extract from frontmatter
  const descMatch = /description:\s*"([^"]+)"/.exec(md);
  if (descMatch) return descMatch[1];

  // Fallback: first non-frontmatter, non-heading line
  const lines = md.split("\n");
  let pastFrontmatter = false;
  for (const line of lines) {
    if (line.startsWith("---")) {
      pastFrontmatter = !pastFrontmatter;
      continue;
    }
    if (!pastFrontmatter && line && !line.startsWith("#")) {
      return line.slice(0, 500);
    }
  }
  return "";
}

async function main() {
  const supabase = getSupabase();
  const cmdDir = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "commands",
  );

  console.log(`Reading commands from ${cmdDir}...`);
  const files = await readdir(cmdDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  console.log(`Found ${mdFiles.length} command files`);

  const rows: Record<string, unknown>[] = [];

  for (const file of mdFiles) {
    const slug = file.replace(/\.md$/, "");
    const md = await readFile(resolve(cmdDir, file), "utf-8");

    rows.push({
      name: capitalize(slug),
      slug,
      description: extractDescription(md),
      prompt_template: md,
      category: CATEGORY_MAP[slug] || "workflow",
      is_global: true,
    });
  }

  console.log(`Upserting ${rows.length} commands...`);
  const count = await batchUpsert(supabase, "exo_commands", rows, "slug");
  console.log(`Done: ${count} commands seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
