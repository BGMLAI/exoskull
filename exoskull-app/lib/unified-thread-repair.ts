/**
 * Unified Thread Repair Utility
 *
 * Removes duplicate consecutive messages and error responses from corrupted threads.
 * Run once after deploying the duplication fix to clean existing data.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Repair a corrupted unified thread by removing:
 * - Duplicate consecutive user messages with the same content
 * - Error response messages ("Przepraszam, wystąpił problem...")
 */
export async function repairThread(tenantId: string): Promise<{
  removed: number;
  remaining: number;
}> {
  const supabase = getServiceSupabase();

  const { data: messages, error } = await supabase
    .from("exo_unified_messages")
    .select("id, role, content, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !messages || messages.length === 0) {
    return { removed: 0, remaining: messages?.length || 0 };
  }

  const idsToRemove: string[] = [];

  // Remove duplicate consecutive user messages with same content
  for (let i = 1; i < messages.length; i++) {
    const curr = messages[i];
    const prev = messages[i - 1];
    if (
      curr.role === prev.role &&
      curr.role === "user" &&
      curr.content === prev.content
    ) {
      idsToRemove.push(curr.id);
    }
  }

  // Remove error responses
  for (const msg of messages) {
    if (
      msg.role === "assistant" &&
      msg.content?.includes("Przepraszam, wystąpił problem")
    ) {
      idsToRemove.push(msg.id);
    }
  }

  // Deduplicate IDs
  const uniqueIds = [...new Set(idsToRemove)];

  if (uniqueIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("exo_unified_messages")
      .delete()
      .in("id", uniqueIds);

    if (deleteError) {
      console.error("[ThreadRepair] Delete failed:", deleteError);
      return { removed: 0, remaining: messages.length };
    }
  }

  console.log(
    `[ThreadRepair] tenant=${tenantId}: removed ${uniqueIds.length}, remaining ${messages.length - uniqueIds.length}`,
  );

  return {
    removed: uniqueIds.length,
    remaining: messages.length - uniqueIds.length,
  };
}
