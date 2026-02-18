// Seed 380+ Skills into exo_generated_skills
// Reads all SKILL.md files from ~/.claude/skills/*/SKILL.md
// Usage: npx tsx scripts/seed-skills.ts

import { readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import {
  getSupabase,
  capitalize,
  batchUpsert,
  SYSTEM_TENANT_ID,
} from "./seed-helpers";

function extractCapabilities(md: string): Record<string, string[]> {
  const caps: Record<string, string[]> = {};
  const headings = md.match(/^##\s+(.+)$/gm) || [];
  for (const h of headings) {
    const name = h
      .replace(/^##\s+/, "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    caps[name] = ["read"];
  }
  return caps;
}

async function findSkillFiles(): Promise<string[]> {
  const skillDir = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "skills",
  );

  // Use readdir to find skill directories, then check for SKILL.md
  const { readdir, access } = await import("node:fs/promises");
  const files: string[] = [];

  try {
    const entries = await readdir(skillDir);
    for (const entry of entries) {
      const skillFile = resolve(skillDir, entry, "SKILL.md");
      try {
        await access(skillFile);
        files.push(skillFile);
      } catch {
        // No SKILL.md in this directory
      }
    }
  } catch (err) {
    console.error(`Could not read skill directory ${skillDir}:`, err);
  }

  return files;
}

async function main() {
  const supabase = getSupabase();

  console.log("Finding skill files...");
  const skillFiles = await findSkillFiles();
  console.log(`Found ${skillFiles.length} skills`);

  const rows: Record<string, unknown>[] = [];

  for (const filePath of skillFiles) {
    const slug = basename(dirname(filePath));
    const md = await readFile(filePath, "utf-8");
    const name = capitalize(slug);

    // Extract first paragraph as description
    const lines = md.split("\n").filter((l) => l && !l.startsWith("#"));
    const description = lines.slice(0, 3).join("\n").slice(0, 2000) || name;

    rows.push({
      tenant_id: SYSTEM_TENANT_ID,
      slug,
      name,
      description: md.slice(0, 10000), // Store full SKILL.md as description
      version: "1.0.0",
      tier: "verified",
      executor_code: `// Prompt-based skill — instruction in description\nexport async function execute(input: any) {\n  return { type: "prompt_skill", slug: "${slug}" };\n}`,
      config_schema: {},
      capabilities: extractCapabilities(md),
      allowed_tools: [],
      risk_level: "low",
      generated_by: "claude-code-import",
      approval_status: "approved",
    });
  }

  console.log(`Upserting ${rows.length} skills...`);
  const count = await batchUpsert(
    supabase,
    "exo_generated_skills",
    rows,
    "tenant_id,slug,version",
  );
  console.log(`Done: ${count} skills seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
