/**
 * Seed MCP Servers → exo_mcp_servers
 *
 * Reads ~/.claude/settings.json mcpServers section and upserts
 * all server configurations into Supabase.
 *
 * Usage: npx tsx scripts/seed-mcp-servers.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSupabase, batchUpsert } from "./seed-helpers";

// ── Category mapping ──
const CATEGORY_MAP: Record<string, string> = {
  memory: "utility",
  "sequential-thinking": "utility",
  fetch: "utility",
  filesystem: "utility",
  time: "utility",
  screenshot: "utility",
  echarts: "utility",
  "rss-reader": "utility",
  context7: "utility",
  git: "dev",
  "github-official": "dev",
  gitlab: "dev",
  docker: "dev",
  playwright: "dev",
  supabase: "dev",
  greptile: "dev",
  serena: "dev",
  "laravel-boost": "dev",
  vercel: "dev",
  cloudflare: "dev",
  slack: "comms",
  "slack-remote": "comms",
  discord: "comms",
  resend: "comms",
  notion: "comms",
  asana: "comms",
  linear: "comms",
  postgres: "data",
  "google-workspace": "data",
  "google-play": "data",
  "app-store-connect": "data",
  "google-maps": "data",
  "youtube-transcript": "data",
  "google-dev-knowledge": "data",
  duckduckgo: "data",
  "brave-search": "data",
  stripe: "finance",
  revolut: "finance",
  zen: "finance",
  kontomatik: "finance",
  elevenlabs: "ai",
  sentry: "ai",
  puppeteer: "ai",
  twilio: "ai",
  firebase: "ai",
  "1password": "ai",
};

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
}

async function main() {
  const supabase = getSupabase();

  const settingsPath = resolve(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    "settings.json",
  );

  console.log(`Reading settings from ${settingsPath}...`);
  const raw = await readFile(settingsPath, "utf-8");
  const settings = JSON.parse(raw);
  const mcpServers: Record<string, McpServerConfig> = settings.mcpServers || {};

  const names = Object.keys(mcpServers);
  console.log(`Found ${names.length} MCP servers`);

  const rows: Record<string, unknown>[] = [];

  for (const name of names) {
    const config = mcpServers[name];

    // Determine type
    let serverType = "stdio";
    if (config.url) {
      serverType = config.url.includes("/sse") ? "sse" : "http";
    }
    if (config.type) {
      serverType = config.type;
    }

    // Extract env var names (not values!)
    const envVars: Record<string, string> = {};
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Mark whether it references an env var (${...}) or is hardcoded
        envVars[key] = String(value).startsWith("${") ? "env_ref" : "set";
      }
    }

    const requiresAuth =
      Object.keys(envVars).length > 0 ||
      ["github-official", "slack", "notion", "stripe", "sentry"].includes(name);

    // Infer capabilities from server name
    const capabilities: string[] = [];
    if (["postgres", "supabase", "git", "filesystem"].includes(name)) {
      capabilities.push("read", "write");
    } else if (
      ["brave-search", "duckduckgo", "google-dev-knowledge"].includes(name)
    ) {
      capabilities.push("search");
    } else if (["slack", "discord", "resend", "notion"].includes(name)) {
      capabilities.push("read", "write", "send");
    } else {
      capabilities.push("read");
    }

    rows.push({
      name,
      type: serverType,
      command: config.command || null,
      args: config.args || [],
      env_vars: envVars,
      url: config.url || null,
      description: `MCP server: ${name}`,
      capabilities,
      category: CATEGORY_MAP[name] || "utility",
      requires_auth: requiresAuth,
      is_enabled: true,
    });
  }

  console.log(`Upserting ${rows.length} MCP servers...`);
  const count = await batchUpsert(supabase, "exo_mcp_servers", rows, "name");
  console.log(`Done: ${count} MCP servers seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
