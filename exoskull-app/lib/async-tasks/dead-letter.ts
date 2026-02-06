/**
 * Dead Letter Queue — CRUD for failed async tasks.
 *
 * When async tasks exhaust all retries, they land here for review.
 * Admin can retry (re-enqueue) or discard.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { createTask } from "./queue";

interface DeadLetter {
  id: string;
  original_task_id: string;
  tenant_id: string;
  channel: string;
  prompt: string;
  final_error: string;
  retry_count: number;
  created_at: string;
  reviewed_at: string | null;
  resolution: string | null;
}

/**
 * Get unreviewed dead letters, newest first.
 */
export async function getUnreviewedDeadLetters(
  limit = 50,
): Promise<DeadLetter[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("exo_async_dead_letters")
    .select("*")
    .is("reviewed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as DeadLetter[]) || [];
}

/**
 * Re-enqueue a dead letter as a fresh async task.
 */
export async function retryDeadLetter(deadLetterId: string): Promise<string> {
  const db = getServiceSupabase();

  const { data: dl } = await db
    .from("exo_async_dead_letters")
    .select("*")
    .eq("id", deadLetterId)
    .single();

  if (!dl) throw new Error(`Dead letter ${deadLetterId} not found`);

  const newTaskId = await createTask({
    tenantId: dl.tenant_id,
    channel: dl.channel,
    channelMetadata: {},
    replyTo: dl.channel,
    prompt: dl.prompt,
  });

  await db
    .from("exo_async_dead_letters")
    .update({
      reviewed_at: new Date().toISOString(),
      resolution: "retried",
    })
    .eq("id", deadLetterId);

  return newTaskId;
}

/**
 * Discard a dead letter (mark as reviewed).
 */
export async function discardDeadLetter(deadLetterId: string): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("exo_async_dead_letters")
    .update({
      reviewed_at: new Date().toISOString(),
      resolution: "discarded",
    })
    .eq("id", deadLetterId);
}

/**
 * Get dead letter stats for monitoring.
 */
export async function getDeadLetterStats(): Promise<{
  unreviewed: number;
  total_24h: number;
}> {
  const db = getServiceSupabase();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [unreviewedRes, recentRes] = await Promise.all([
    db
      .from("exo_async_dead_letters")
      .select("id", { count: "exact", head: true })
      .is("reviewed_at", null),
    db
      .from("exo_async_dead_letters")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yesterday),
  ]);

  return {
    unreviewed: unreviewedRes.count || 0,
    total_24h: recentRes.count || 0,
  };
}
