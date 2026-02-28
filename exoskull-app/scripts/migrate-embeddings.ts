/**
 * Re-embed Migration Script
 *
 * One-time migration to embed existing data that lacks embeddings:
 *   1. exo_unified_messages → chunk → embed → store in exo_vector_embeddings (layer: daily)
 *   2. user_memory_highlights → embed → store in exo_vector_embeddings (layer: tacit)
 *
 * Usage:
 *   npx tsx scripts/migrate-embeddings.ts [--tenant=TENANT_ID] [--batch=100] [--dry-run]
 *
 * Requires: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small";

const args = process.argv.slice(2);
const tenantFilter = args.find((a) => a.startsWith("--tenant="))?.split("=")[1];
const batchSize = parseInt(
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] || "100",
);
const dryRun = args.includes("--dry-run");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================================
// HELPERS
// ============================================================================

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI error: ${response.status} ${await response.text()}`,
    );
  }

  const data = await response.json();
  return data.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

function hashContent(text: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function isWorthEmbedding(content: string): boolean {
  if (!content || content.trim().length < 40) return false;
  if (
    /^(ok|tak|nie|dzięki|super|fajnie|git|spoko|hej|mhm|aha|jasne|dobra)\s*[.!?]*$/i.test(
      content.trim(),
    )
  )
    return false;
  return true;
}

// ============================================================================
// MIGRATE MESSAGES
// ============================================================================

async function migrateMessages(tenantId: string): Promise<number> {
  console.log(`  [Messages] Starting for tenant ${tenantId}...`);

  // Get messages that don't have embeddings yet
  const { data: messages, error } = await supabase
    .from("exo_unified_messages")
    .select("id, content, role, channel, created_at")
    .eq("tenant_id", tenantId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !messages) {
    console.error(`  [Messages] Query failed: ${error?.message}`);
    return 0;
  }

  // Filter to meaningful messages
  const meaningful = messages.filter((m) => isWorthEmbedding(m.content));
  console.log(
    `  [Messages] ${messages.length} total, ${meaningful.length} meaningful`,
  );

  if (meaningful.length === 0) return 0;

  // Check which are already embedded
  const hashes = meaningful.map((m) => hashContent(m.content));
  const { data: existing } = await supabase
    .from("exo_vector_embeddings")
    .select("content_hash")
    .eq("tenant_id", tenantId)
    .in("content_hash", hashes);

  const existingHashes = new Set((existing || []).map((e) => e.content_hash));
  const toEmbed = meaningful.filter(
    (m) => !existingHashes.has(hashContent(m.content)),
  );

  console.log(
    `  [Messages] ${toEmbed.length} new (${existingHashes.size} already embedded)`,
  );

  if (toEmbed.length === 0 || dryRun) return 0;

  let totalEmbedded = 0;

  // Process in batches
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const texts = batch.map((m) => m.content.slice(0, 4000));

    try {
      const embeddings = await generateEmbeddings(texts);

      const rows = batch.map((m, j) => ({
        tenant_id: tenantId,
        content: m.content.slice(0, 4000),
        content_hash: hashContent(m.content),
        embedding: JSON.stringify(embeddings[j]),
        source_type: "conversation",
        source_id: m.id,
        metadata: {
          layer: "daily",
          daily_date: m.created_at.split("T")[0],
          role: m.role,
          channel: m.channel,
          migrated: true,
        },
      }));

      const { error: insertError } = await supabase
        .from("exo_vector_embeddings")
        .insert(rows);

      if (insertError) {
        console.error(
          `  [Messages] Batch ${i} insert failed: ${insertError.message}`,
        );
      } else {
        totalEmbedded += batch.length;
        console.log(
          `  [Messages] Batch ${i}-${i + batch.length}: embedded ${batch.length}`,
        );
      }
    } catch (err) {
      console.error(
        `  [Messages] Batch ${i} embedding failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Rate limit: 500ms between batches
    await new Promise((r) => setTimeout(r, 500));
  }

  return totalEmbedded;
}

// ============================================================================
// MIGRATE HIGHLIGHTS
// ============================================================================

async function migrateHighlights(tenantId: string): Promise<number> {
  console.log(`  [Highlights] Starting for tenant ${tenantId}...`);

  const { data: highlights, error } = await supabase
    .from("user_memory_highlights")
    .select("id, content, category, importance, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !highlights) {
    console.error(`  [Highlights] Query failed: ${error?.message}`);
    return 0;
  }

  // Check which are already embedded
  const hashes = highlights.map((h) => hashContent(h.content));
  const { data: existing } = await supabase
    .from("exo_vector_embeddings")
    .select("content_hash")
    .eq("tenant_id", tenantId)
    .in("content_hash", hashes);

  const existingHashes = new Set((existing || []).map((e) => e.content_hash));
  const toEmbed = highlights.filter(
    (h) => !existingHashes.has(hashContent(h.content)),
  );

  console.log(
    `  [Highlights] ${highlights.length} total, ${toEmbed.length} new`,
  );

  if (toEmbed.length === 0 || dryRun) return 0;

  let totalEmbedded = 0;

  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const texts = batch.map((h) => h.content.slice(0, 4000));

    try {
      const embeddings = await generateEmbeddings(texts);

      const rows = batch.map((h, j) => ({
        tenant_id: tenantId,
        content: h.content,
        content_hash: hashContent(h.content),
        embedding: JSON.stringify(embeddings[j]),
        source_type: "conversation",
        source_id: `highlight:${h.id}`,
        metadata: {
          layer: "tacit",
          tacit_category: h.category || "preference",
          importance: h.importance,
          migrated: true,
        },
      }));

      const { error: insertError } = await supabase
        .from("exo_vector_embeddings")
        .insert(rows);

      if (insertError) {
        console.error(
          `  [Highlights] Batch ${i} insert failed: ${insertError.message}`,
        );
      } else {
        totalEmbedded += batch.length;
        console.log(
          `  [Highlights] Batch ${i}-${i + batch.length}: embedded ${batch.length}`,
        );
      }
    } catch (err) {
      console.error(
        `  [Highlights] Batch ${i} embedding failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return totalEmbedded;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("=== Memory Re-embed Migration ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Tenant filter: ${tenantFilter || "ALL"}`);
  console.log();

  // Get tenants to process
  let tenantIds: string[];
  if (tenantFilter) {
    tenantIds = [tenantFilter];
  } else {
    const { data } = await supabase.from("exo_tenants").select("id").limit(100);
    tenantIds = (data || []).map((t) => t.id);
  }

  console.log(`Processing ${tenantIds.length} tenant(s)...\n`);

  let totalMessages = 0;
  let totalHighlights = 0;

  for (const tenantId of tenantIds) {
    console.log(`\nTenant: ${tenantId}`);
    const msgs = await migrateMessages(tenantId);
    const highlights = await migrateHighlights(tenantId);
    totalMessages += msgs;
    totalHighlights += highlights;
    console.log(`  Total: ${msgs} messages, ${highlights} highlights embedded`);
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Messages embedded: ${totalMessages}`);
  console.log(`Highlights embedded: ${totalHighlights}`);
  console.log(`Total new embeddings: ${totalMessages + totalHighlights}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
