/**
 * Seed 40 Plugins → exo_plugins
 *
 * Reads ~/.claude/plugins/installed_plugins.json and upserts
 * plugin metadata into Supabase.
 *
 * Usage: npx tsx scripts/seed-plugins.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSupabase, slugify, capitalize, batchUpsert } from "./seed-helpers";

// ── Category mapping ──
const CATEGORY_MAP: Record<string, string> = {
  "typescript-lsp": "lsp",
  "pyright-lsp": "lsp",
  "clangd-lsp": "lsp",
  "csharp-lsp": "lsp",
  "gopls-lsp": "lsp",
  "jdtls-lsp": "lsp",
  "kotlin-lsp": "lsp",
  "lua-lsp": "lsp",
  "php-lsp": "lsp",
  "rust-analyzer-lsp": "lsp",
  "swift-lsp": "lsp",
  playwright: "dev-workflow",
  supabase: "dev-workflow",
  "code-review": "dev-workflow",
  "security-guidance": "dev-workflow",
  "commit-commands": "dev-workflow",
  hookify: "dev-workflow",
  "feature-dev": "dev-workflow",
  "pr-review-toolkit": "dev-workflow",
  github: "dev-workflow",
  "agent-sdk-dev": "dev-workflow",
  "code-simplifier": "dev-workflow",
  "plugin-dev": "dev-workflow",
  "explanatory-output-style": "output-style",
  "learning-output-style": "output-style",
  asana: "integration",
  firebase: "integration",
  gitlab: "integration",
  greptile: "integration",
  "laravel-boost": "integration",
  linear: "integration",
  serena: "integration",
  slack: "integration",
  stripe: "integration",
  "claude-md-management": "meta",
  "ralph-loop": "meta",
  "claude-code-setup": "meta",
  context7: "meta",
  "frontend-design": "meta",
  playground: "meta",
};

async function main() {
  const supabase = getSupabase();

  const pluginPath = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "plugins",
    "installed_plugins.json",
  );

  console.log(`Reading plugins from ${pluginPath}...`);
  let pluginData: unknown;
  try {
    const raw = await readFile(pluginPath, "utf-8");
    pluginData = JSON.parse(raw);
  } catch {
    console.error("Could not read installed_plugins.json — skipping");
    return;
  }

  // installed_plugins.json format: { version: 2, plugins: { "name@source": [...] } }
  const pluginNames: string[] = [];
  const parsed = pluginData as unknown as {
    version?: number;
    plugins?: Record<string, unknown[]>;
  };
  if (parsed.plugins && typeof parsed.plugins === "object") {
    for (const key of Object.keys(parsed.plugins)) {
      // key format: "typescript-lsp@claude-plugins-official"
      const name = key.split("@")[0];
      if (name) pluginNames.push(name);
    }
  } else if (Array.isArray(pluginData)) {
    for (const item of pluginData) {
      if (typeof item === "string") pluginNames.push(item);
      else if (typeof item === "object" && item && "name" in item) {
        pluginNames.push(String((item as Record<string, unknown>).name));
      }
    }
  }

  console.log(`Found ${pluginNames.length} plugins`);

  const rows: Record<string, unknown>[] = [];

  for (const name of pluginNames) {
    const slug = slugify(name);
    const category = CATEGORY_MAP[slug] || CATEGORY_MAP[name] || "meta";

    const capabilities: string[] = [];
    if (category === "lsp")
      capabilities.push("code_intelligence", "diagnostics");
    else if (category === "dev-workflow") capabilities.push("code_workflow");
    else if (category === "integration") capabilities.push("external_api");
    else capabilities.push("utility");

    rows.push({
      name: capitalize(slug),
      slug,
      category,
      description: `Plugin: ${name}`,
      capabilities,
      source: "claude-plugins-official",
      is_enabled: true,
      config: {},
    });
  }

  console.log(`Upserting ${rows.length} plugins...`);
  const count = await batchUpsert(supabase, "exo_plugins", rows, "slug");
  console.log(`Done: ${count} plugins seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
