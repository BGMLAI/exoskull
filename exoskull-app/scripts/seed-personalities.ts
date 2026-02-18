/**
 * Seed 525+ Mentor/Therapist/Coach Personalities → exo_agents
 *
 * Parses two Python scripts that contain VAPI personality tuples:
 * - mass_create_personalities.py (225 personalities)
 * - final_personalities_batch.py (300 personalities)
 *
 * Extracts (name, system_prompt, greeting) tuples and upserts into exo_agents.
 *
 * Usage: npx tsx scripts/seed-personalities.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSupabase, slugify, batchUpsert } from "./seed-helpers";

// ── Category → type mapping ──
const CATEGORY_TYPE_MAP: Record<string, string> = {
  business_personalities: "business",
  tech_personalities: "specialized",
  therapy_personalities: "personal",
  life_coaching_personalities: "personal",
  life_coaching: "personal",
  creative_personalities: "creative",
  creative_specialists: "creative",
  education_personalities: "specialized",
  education_specialists: "specialized",
  multilingual_personalities: "specialized",
  multilingual_specialists: "specialized",
  additional_specialists: "specialized",
  health_personalities: "personal",
};

// ── Category → tier mapping ──
const CATEGORY_TIER_MAP: Record<string, number> = {
  business_personalities: 2,
  tech_personalities: 2,
  therapy_personalities: 3,
  life_coaching_personalities: 3,
  life_coaching: 3,
  creative_personalities: 2,
  creative_specialists: 2,
  education_personalities: 2,
  education_specialists: 2,
  multilingual_personalities: 2,
  multilingual_specialists: 2,
  additional_specialists: 2,
  health_personalities: 3,
};

interface ParsedPersonality {
  name: string;
  systemPrompt: string;
  greeting: string;
  category: string;
}

/**
 * Parse Python file containing personality tuples.
 *
 * Expected format:
 * category_name = [
 *   ("Name", "System prompt...", "Greeting..."),
 *   ...
 * ]
 */
function parsePythonPersonalities(content: string): ParsedPersonality[] {
  const results: ParsedPersonality[] = [];

  // Find all category blocks: variable_name = [
  // Matches: business_personalities, life_coaching, creative_specialists, etc.
  const categoryRegex =
    /^(\w+(?:_personalities|_coaching|_specialists))\s*=\s*\[/gm;
  let categoryMatch: RegExpExecArray | null;

  while ((categoryMatch = categoryRegex.exec(content)) !== null) {
    const categoryName = categoryMatch[1];
    const startIdx = categoryMatch.index + categoryMatch[0].length;

    // Find matching closing bracket
    let depth = 1;
    let idx = startIdx;
    while (idx < content.length && depth > 0) {
      if (content[idx] === "[") depth++;
      if (content[idx] === "]") depth--;
      idx++;
    }

    const block = content.slice(startIdx, idx - 1);

    // Extract tuples from block
    // Pattern: ("name", "prompt", "greeting")
    const tupleRegex =
      /\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/gs;
    let tupleMatch: RegExpExecArray | null;

    while ((tupleMatch = tupleRegex.exec(block)) !== null) {
      const name = tupleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      const systemPrompt = tupleMatch[2]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n");
      const greeting = tupleMatch[3].replace(/\\"/g, '"').replace(/\\n/g, "\n");

      results.push({
        name,
        systemPrompt,
        greeting,
        category: categoryName,
      });
    }
  }

  // Also handle the `personalities.extend([...])` pattern
  const extendRegex = /personalities\.extend\(\s*(\w+_personalities)\s*\)/g;
  // Already captured via category blocks above

  // Handle inline tuples not in a named category
  // e.g., personalities = [...] or personalities += [...]
  const inlineRegex = /personalities\s*(?:\+?=|\.extend\()\s*\[/gm;
  let inlineMatch: RegExpExecArray | null;

  while ((inlineMatch = inlineRegex.exec(content)) !== null) {
    const startIdx = inlineMatch.index + inlineMatch[0].length;
    let depth = 1;
    let idx = startIdx;
    while (idx < content.length && depth > 0) {
      if (content[idx] === "[") depth++;
      if (content[idx] === "]") depth--;
      idx++;
    }

    const block = content.slice(startIdx, idx - 1);
    const tupleRegex2 =
      /\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/gs;
    let tupleMatch2: RegExpExecArray | null;

    while ((tupleMatch2 = tupleRegex2.exec(block)) !== null) {
      const name = tupleMatch2[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      const sp = tupleMatch2[2].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      const greeting = tupleMatch2[3]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n");

      // Only add if not already found (dedup by name)
      if (!results.some((r) => r.name === name)) {
        results.push({
          name,
          systemPrompt: sp,
          greeting,
          category: "general_personalities",
        });
      }
    }
  }

  return results;
}

function extractCapabilities(systemPrompt: string): string[] {
  const caps: string[] = [];
  const lower = systemPrompt.toLowerCase();

  const keywords: Record<string, string> = {
    therapy: "therapy",
    counseling: "counseling",
    cognitive: "cognitive_behavioral_therapy",
    anxiety: "anxiety",
    depression: "depression",
    trauma: "trauma_therapy",
    ptsd: "ptsd_treatment",
    coaching: "coaching",
    career: "career_coaching",
    leadership: "leadership",
    finance: "finance",
    investment: "investment",
    marketing: "marketing",
    startup: "startup_advisory",
    "machine learning": "machine_learning",
    "data science": "data_science",
    cybersecurity: "cybersecurity",
    blockchain: "blockchain",
    cloud: "cloud_architecture",
    design: "design",
    nutrition: "nutrition",
    fitness: "fitness",
    sleep: "sleep_medicine",
    meditation: "meditation",
  };

  for (const [keyword, cap] of Object.entries(keywords)) {
    if (lower.includes(keyword)) caps.push(cap);
  }

  return caps.slice(0, 10);
}

async function main() {
  const supabase = getSupabase();
  const archiveDir = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "archive",
    "scripts",
  );

  const files = [
    "mass_create_personalities.py",
    "final_personalities_batch.py",
  ];

  const allPersonalities: ParsedPersonality[] = [];

  for (const file of files) {
    const filePath = resolve(archiveDir, file);
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parsePythonPersonalities(content);
      console.log(`Parsed ${parsed.length} personalities from ${file}`);
      allPersonalities.push(...parsed);
    } catch (err) {
      console.warn(`Could not read ${file}: ${(err as Error).message}`);
    }
  }

  // Dedup by name
  const seen = new Set<string>();
  const unique: ParsedPersonality[] = [];
  for (const p of allPersonalities) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      unique.push(p);
    }
  }

  console.log(`Total unique personalities: ${unique.length}`);

  const rows: Record<string, unknown>[] = [];

  for (const p of unique) {
    const slug = slugify(p.name);
    const type = CATEGORY_TYPE_MAP[p.category] || "specialized";
    const tier = CATEGORY_TIER_MAP[p.category] || 2;

    rows.push({
      name: p.name,
      slug,
      system_prompt: p.systemPrompt,
      type,
      tier,
      description: p.systemPrompt.slice(0, 500),
      capabilities: extractCapabilities(p.systemPrompt),
      is_global: true,
      active: true,
      auto_generated: false,
      depth: 0,
      personality_config: {
        source: "vapi-vault",
        greeting: p.greeting,
        category: p.category,
      },
    });
  }

  console.log(`Upserting ${rows.length} personality agents...`);
  const count = await batchUpsert(supabase, "exo_agents", rows, "slug");
  console.log(`Done: ${count} personality agents seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
