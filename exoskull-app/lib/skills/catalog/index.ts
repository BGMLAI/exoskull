/**
 * Skill Catalog — .md file parser and registry
 *
 * Skills are defined as markdown files with YAML frontmatter.
 * This module discovers, parses, and indexes them so IORS can
 * reference skill instructions when executing complex tasks.
 *
 * Format (like Claude Code skills):
 * ---
 * name: skill-name
 * description: What this skill does
 * tools_used: [tool1, tool2]
 * trigger: When to activate
 * cost: ~$X.XX per use
 * requires_vps: false
 * ---
 * # Skill Title
 * ## When to Use
 * ## Process
 * ## Examples
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface SkillMeta {
  name: string;
  description: string;
  tools_used: string[];
  trigger?: string;
  cost?: string;
  requires_vps?: boolean;
}

export interface CatalogSkill {
  meta: SkillMeta;
  instructions: string; // Full markdown body (after frontmatter)
  filePath: string;
}

// ============================================================================
// FRONTMATTER PARSER
// ============================================================================

function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(fmRegex);

  if (!match) {
    return { meta: {}, body: content };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();

  // Simple YAML parser (handles key: value and key: [array])
  const meta: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Handle arrays (YAML list on single line)
    if (typeof value === "string" && value.startsWith("[")) {
      try {
        value = JSON.parse(value.replace(/'/g, '"'));
      } catch {
        // Keep as string
      }
    }
    // Handle booleans
    if (value === "true") value = true;
    if (value === "false") value = false;

    meta[key] = value;
  }

  return { meta, body };
}

// Handle multi-line YAML arrays (- item format)
function parseYamlArrays(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fmRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(fmRegex);
  if (!match) return result;

  const lines = match[1].split("\n");
  let currentKey = "";
  let currentArray: string[] = [];
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^\w+:/) && !line.match(/^\s+-/)) {
      // Save previous array
      if (inArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
      }
      const colonIdx = line.indexOf(":");
      currentKey = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!value) {
        // Next lines might be array items
        inArray = true;
      }
    } else if (line.match(/^\s+-\s+/)) {
      const item = line.replace(/^\s+-\s+/, "").trim();
      currentArray.push(item);
      inArray = true;
    }
  }

  if (inArray && currentKey) {
    result[currentKey] = currentArray;
  }

  return result;
}

// ============================================================================
// CATALOG LOADER
// ============================================================================

let catalogCache: CatalogSkill[] | null = null;

/**
 * Load all .md skills from the catalog directory.
 * Cached after first load (server restart clears cache).
 */
export function loadSkillCatalog(): CatalogSkill[] {
  if (catalogCache) return catalogCache;

  const catalogDir = path.join(__dirname);
  const skills: CatalogSkill[] = [];

  try {
    const files = fs.readdirSync(catalogDir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      try {
        const filePath = path.join(catalogDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const { meta, body } = parseFrontmatter(content);
        const arrayOverrides = parseYamlArrays(content);

        // Merge tools_used from array format
        const tools_used =
          (arrayOverrides.tools_used as string[]) ||
          (meta.tools_used as string[]) ||
          [];

        const skillMeta: SkillMeta = {
          name: (meta.name as string) || file.replace(".md", ""),
          description: (meta.description as string) || "",
          tools_used,
          trigger: meta.trigger as string | undefined,
          cost: meta.cost as string | undefined,
          requires_vps: meta.requires_vps as boolean | undefined,
        };

        skills.push({
          meta: skillMeta,
          instructions: body,
          filePath,
        });
      } catch (err) {
        console.warn(`[SkillCatalog] Failed to parse ${file}:`, err);
      }
    }
  } catch (err) {
    console.warn("[SkillCatalog] Failed to read catalog directory:", err);
  }

  catalogCache = skills;
  return skills;
}

/**
 * Find a skill by name.
 */
export function findSkill(name: string): CatalogSkill | undefined {
  const catalog = loadSkillCatalog();
  return catalog.find(
    (s) =>
      s.meta.name === name ||
      s.meta.name === name.replace("/", "") ||
      s.meta.name === name.replace(/^\//, ""),
  );
}

/**
 * Find skills that use a specific tool.
 */
export function findSkillsByTool(toolName: string): CatalogSkill[] {
  const catalog = loadSkillCatalog();
  return catalog.filter((s) => s.meta.tools_used.includes(toolName));
}

/**
 * Get a concise skill list for the system prompt (~200 tokens).
 */
export function getSkillCatalogSummary(): string {
  const catalog = loadSkillCatalog();
  if (catalog.length === 0) return "";

  const lines = catalog.map(
    (s) =>
      `- /${s.meta.name}: ${s.meta.description}${s.meta.cost ? ` (${s.meta.cost})` : ""}`,
  );

  return `\n### Dostepne Skille (${catalog.length})\n${lines.join("\n")}`;
}

/**
 * Get full skill instructions for a specific skill.
 * Used when IORS is about to execute the skill.
 */
export function getSkillInstructions(name: string): string | null {
  const skill = findSkill(name);
  if (!skill) return null;
  return skill.instructions;
}

/**
 * Clear cache (useful after adding new skills at runtime).
 */
export function clearSkillCatalogCache(): void {
  catalogCache = null;
}
