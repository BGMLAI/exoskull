/**
 * Seed 46 Claude Code Agents → exo_agents
 *
 * Reads all .md files from ~/.claude/agents/, parses metadata,
 * and upserts into Supabase exo_agents table.
 *
 * Usage: npx tsx scripts/seed-agents.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSupabase, capitalize, batchUpsert } from "./seed-helpers";

// ── Tier mapping ──
const TIER_MAP: Record<string, number> = {
  "automator-scraper": 1,
  seo: 1,
  "content-multimodal": 1,
  debugger: 2,
  "tester-qa": 2,
  "data-analyst": 2,
  "copywriter-sales": 2,
  "copywriter-fiction": 2,
  "copywriter-academic": 2,
  marketer: 2,
  "growth-hacker": 2,
  "customer-success": 2,
  architect: 3,
  builder: 3,
  devops: 3,
  researcher: 3,
  "product-manager": 3,
  strategist: 3,
  "business-model": 3,
  "ui-ux-designer": 3,
  "graphic-designer": 3,
  coo: 3,
  "pr-media": 3,
  launcher: 3,
  "ads-optimizer": 3,
  "legal-ops": 3,
  mythmaker: 3,
  "revenue-engine": 3,
  "tax-architect": 3,
  "real-estate-scout": 3,
  "defi-yield-agent": 3,
  "asset-builder": 3,
  "deal-radar": 3,
  "life-ops": 3,
  "nomad-ops": 3,
  "health-longevity": 3,
  biohacker: 3,
  "coach-performance": 3,
  orchestrator: 4,
  "wealth-pilot": 4,
  "cfo-finance": 4,
  "therapist-trauma": 4,
  "therapist-relationship": 4,
  guardian: 4,
  mental: 4,
  optimizer: 4,
};

// ── Type mapping ──
const TYPE_MAP: Record<string, string> = {
  orchestrator: "core",
  guardian: "core",
  architect: "specialized",
  builder: "specialized",
  researcher: "specialized",
  debugger: "specialized",
  devops: "specialized",
  "tester-qa": "specialized",
  "data-analyst": "specialized",
  "automator-scraper": "specialized",
  optimizer: "specialized",
  "product-manager": "specialized",
  coo: "specialized",
  "ui-ux-designer": "specialized",
  "therapist-trauma": "personal",
  "therapist-relationship": "personal",
  "coach-performance": "personal",
  mental: "personal",
  "health-longevity": "personal",
  biohacker: "personal",
  "life-ops": "personal",
  "nomad-ops": "personal",
  "cfo-finance": "business",
  "wealth-pilot": "business",
  "tax-architect": "business",
  "revenue-engine": "business",
  "business-model": "business",
  strategist: "business",
  "real-estate-scout": "business",
  "defi-yield-agent": "business",
  "asset-builder": "business",
  "deal-radar": "business",
  "copywriter-sales": "creative",
  "copywriter-fiction": "creative",
  "copywriter-academic": "creative",
  mythmaker: "creative",
  "content-multimodal": "creative",
  "graphic-designer": "creative",
  marketer: "marketing",
  "growth-hacker": "marketing",
  "pr-media": "marketing",
  seo: "marketing",
  launcher: "marketing",
  "ads-optimizer": "marketing",
  "customer-success": "support",
  "legal-ops": "support",
};

function extractSection(md: string, section: string): string {
  const re = new RegExp(`^##\\s+${section}\\s*$`, "mi");
  const match = re.exec(md);
  if (!match) return "";
  const start = match.index + match[0].length;
  const next = md.indexOf("\n## ", start);
  return md.slice(start, next === -1 ? md.length : next).trim();
}

function extractDescription(md: string): string {
  const identity = extractSection(md, "Identity");
  if (identity) {
    const firstPara = identity.split("\n\n")[0];
    return firstPara.slice(0, 500);
  }
  // Fallback: first non-heading paragraph
  const lines = md.split("\n");
  for (const line of lines) {
    if (
      line &&
      !line.startsWith("#") &&
      !line.startsWith("|") &&
      !line.startsWith("-")
    ) {
      return line.slice(0, 500);
    }
  }
  return "";
}

function extractCapabilities(md: string): string[] {
  const caps: string[] = [];
  const resp = extractSection(md, "Core Responsibilities");
  if (resp) {
    const matches = resp.match(/\*\*(.+?)\*\*/g) || [];
    for (const m of matches) {
      caps.push(m.replace(/\*\*/g, "").toLowerCase().replace(/\s+/g, "_"));
    }
  }
  return caps.slice(0, 20);
}

async function main() {
  const supabase = getSupabase();
  const agentDir = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "agents",
  );

  console.log(`Reading agents from ${agentDir}...`);
  const files = await readdir(agentDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  console.log(`Found ${mdFiles.length} agent files`);

  const rows: Record<string, unknown>[] = [];

  for (const file of mdFiles) {
    const slug = file.replace(/\.md$/, "");
    const md = await readFile(resolve(agentDir, file), "utf-8");
    const nameMatch = /^#\s+Agent:\s+(.+)$/m.exec(md);
    const name = nameMatch ? nameMatch[1].trim() : capitalize(slug);

    rows.push({
      name,
      slug,
      system_prompt: md,
      type: TYPE_MAP[slug] || "specialized",
      tier: TIER_MAP[slug] || 3,
      description: extractDescription(md),
      capabilities: extractCapabilities(md),
      is_global: true,
      active: true,
      auto_generated: false,
      depth: 0,
      personality_config: {
        slug,
        source: "claude-code-agent",
      },
    });
  }

  console.log(`Upserting ${rows.length} agents...`);
  const count = await batchUpsert(supabase, "exo_agents", rows, "slug");
  console.log(`Done: ${count} agents seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
