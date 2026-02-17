/**
 * Backfill Note Embeddings
 *
 * Generates embeddings for all user_notes that have content but no embedding.
 * Rate-limited to avoid OpenAI API throttling.
 *
 * Usage: npx tsx scripts/backfill-note-embeddings.ts
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_EMBEDDING_INPUT = 8000;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey || !openaiKey) {
    console.error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Count notes without embeddings
  const { count: totalCount } = await supabase
    .from("user_notes")
    .select("id", { count: "exact", head: true })
    .is("embedding", null)
    .not("content", "is", null);

  console.log(`[Backfill] Found ${totalCount ?? 0} notes without embeddings`);
  if (!totalCount) {
    console.log("[Backfill] Nothing to do.");
    return;
  }

  let processed = 0;
  let errors = 0;

  while (processed < totalCount) {
    // Fetch batch of notes without embeddings
    const { data: notes, error: fetchError } = await supabase
      .from("user_notes")
      .select("id, title, content")
      .is("embedding", null)
      .not("content", "is", null)
      .order("captured_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[Backfill] Fetch error:", fetchError.message);
      break;
    }

    if (!notes || notes.length === 0) break;

    // Prepare texts for batch embedding
    const texts = notes.map((note) =>
      [note.title, note.content]
        .filter(Boolean)
        .join(": ")
        .slice(0, MAX_EMBEDDING_INPUT),
    );

    // Filter out empty/too-short texts
    const validIndices = texts
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.length >= 10);

    if (validIndices.length === 0) {
      processed += notes.length;
      continue;
    }

    try {
      // Batch embed
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: validIndices.map(({ t }) => t),
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`[Backfill] OpenAI API error: ${response.status} ${err}`);
        errors += validIndices.length;

        // Rate limit — wait longer
        if (response.status === 429) {
          console.log("[Backfill] Rate limited, waiting 30s...");
          await sleep(30000);
          continue;
        }
        break;
      }

      const data = await response.json();
      const embeddings = data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((d: { embedding: number[] }) => d.embedding);

      // Update each note with its embedding
      for (let j = 0; j < validIndices.length; j++) {
        const noteId = notes[validIndices[j].i].id;
        const { error: updateError } = await supabase
          .from("user_notes")
          .update({
            embedding: JSON.stringify(embeddings[j]),
            processed_at: new Date().toISOString(),
          })
          .eq("id", noteId);

        if (updateError) {
          console.error(
            `[Backfill] Update error for ${noteId}:`,
            updateError.message,
          );
          errors++;
        }
      }

      processed += notes.length;
      console.log(
        `[Backfill] Progress: ${processed}/${totalCount} (${errors} errors)`,
      );
    } catch (err) {
      console.error("[Backfill] Batch error:", err);
      errors += validIndices.length;
      break;
    }

    // Rate limit delay
    await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  console.log(`[Backfill] Done. Processed: ${processed}, Errors: ${errors}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
