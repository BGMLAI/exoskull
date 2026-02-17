/**
 * Note Embeddings
 *
 * Generates and stores embeddings for user_notes.
 * Uses existing generateEmbedding() from vector-store.ts.
 * Designed for fire-and-forget calls after note creation.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { generateEmbedding } from "./vector-store";

import { logger } from "@/lib/logger";
/**
 * Generate and store embedding for a single note.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function generateAndStoreNoteEmbedding(
  noteId: string,
  content: string,
  title?: string | null,
): Promise<void> {
  try {
    const textToEmbed = [title, content].filter(Boolean).join(": ");
    if (!textToEmbed || textToEmbed.length < 10) return;

    const embedding = await generateEmbedding(textToEmbed);
    const supabase = getServiceSupabase();

    const { error } = await supabase
      .from("user_notes")
      .update({
        embedding: JSON.stringify(embedding),
        processed_at: new Date().toISOString(),
      })
      .eq("id", noteId);

    if (error) {
      logger.error("[NoteEmbeddings] Failed to store embedding:", {
        noteId,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error("[NoteEmbeddings] Embedding generation failed:", {
      noteId,
      error: error instanceof Error ? error.message : error,
    });
  }
}
