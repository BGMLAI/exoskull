/**
 * Seed Ecosystem Registry → exo_ecosystem_registry
 *
 * Aggregates all seeded resources (agents, skills, frameworks, MCP servers,
 * plugins, commands) into a unified lookup table for IORS discovery.
 *
 * Usage: npx tsx scripts/seed-ecosystem-registry.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run AFTER all other seed scripts have completed.
 */

import { getSupabase, batchUpsert } from "./seed-helpers";

interface RegistryEntry {
  resource_type: string;
  resource_id: string;
  name: string;
  slug: string;
  capabilities: string[];
  is_enabled: boolean;
  metadata: Record<string, unknown>;
}

async function main() {
  const supabase = getSupabase();
  const entries: RegistryEntry[] = [];

  // ── 1. Agents ──
  console.log("Fetching agents...");
  const { data: agents } = await supabase
    .from("exo_agents")
    .select("id, name, slug, capabilities, active, type, tier");

  if (agents) {
    for (const a of agents) {
      entries.push({
        resource_type: "agent",
        resource_id: a.id,
        name: a.name,
        slug: a.slug || a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        capabilities: a.capabilities || [],
        is_enabled: a.active ?? true,
        metadata: { type: a.type, tier: a.tier },
      });
    }
    console.log(`  ${agents.length} agents`);
  }

  // ── 2. Skills ──
  console.log("Fetching skills...");
  const { data: skills } = await supabase
    .from("exo_generated_skills")
    .select("id, name, slug, capabilities, approval_status");

  if (skills) {
    for (const s of skills) {
      const caps = Array.isArray(s.capabilities)
        ? s.capabilities
        : typeof s.capabilities === "object" && s.capabilities
          ? Object.keys(s.capabilities)
          : [];
      entries.push({
        resource_type: "skill",
        resource_id: s.id,
        name: s.name,
        slug: s.slug,
        capabilities: caps as string[],
        is_enabled: s.approval_status === "approved",
        metadata: { approval_status: s.approval_status },
      });
    }
    console.log(`  ${skills.length} skills`);
  }

  // ── 3. Frameworks ──
  console.log("Fetching frameworks...");
  const { data: frameworks } = await supabase
    .from("bgml_frameworks")
    .select("id, name, slug, domain, quality_score");

  if (frameworks) {
    for (const f of frameworks) {
      entries.push({
        resource_type: "framework",
        resource_id: f.id,
        name: f.name,
        slug: f.slug,
        capabilities: [f.domain, "reasoning"],
        is_enabled: true,
        metadata: { domain: f.domain, quality_score: f.quality_score },
      });
    }
    console.log(`  ${frameworks.length} frameworks`);
  }

  // ── 4. MCP Servers ──
  console.log("Fetching MCP servers...");
  const { data: mcpServers } = await supabase
    .from("exo_mcp_servers")
    .select("id, name, capabilities, category, is_enabled");

  if (mcpServers) {
    for (const m of mcpServers) {
      entries.push({
        resource_type: "mcp",
        resource_id: m.id,
        name: m.name,
        slug: m.name,
        capabilities: m.capabilities || [],
        is_enabled: m.is_enabled ?? true,
        metadata: { category: m.category },
      });
    }
    console.log(`  ${mcpServers.length} MCP servers`);
  }

  // ── 5. Plugins ──
  console.log("Fetching plugins...");
  const { data: plugins } = await supabase
    .from("exo_plugins")
    .select("id, name, slug, capabilities, category, is_enabled");

  if (plugins) {
    for (const p of plugins) {
      entries.push({
        resource_type: "plugin",
        resource_id: p.id,
        name: p.name,
        slug: p.slug,
        capabilities: p.capabilities || [],
        is_enabled: p.is_enabled ?? true,
        metadata: { category: p.category },
      });
    }
    console.log(`  ${plugins.length} plugins`);
  }

  // ── 6. Commands ──
  console.log("Fetching commands...");
  const { data: commands } = await supabase
    .from("exo_commands")
    .select("id, name, slug, category, is_global");

  if (commands) {
    for (const c of commands) {
      entries.push({
        resource_type: "command",
        resource_id: c.id,
        name: c.name,
        slug: c.slug,
        capabilities: [c.category || "workflow"],
        is_enabled: c.is_global ?? true,
        metadata: { category: c.category },
      });
    }
    console.log(`  ${commands.length} commands`);
  }

  // ── Upsert all ──
  console.log(`\nUpserting ${entries.length} ecosystem registry entries...`);
  const count = await batchUpsert(
    supabase,
    "exo_ecosystem_registry",
    entries as unknown as Record<string, unknown>[],
    "resource_type,slug",
  );
  console.log(`Done: ${count} registry entries seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
