/**
 * Unified Conversation Thread
 *
 * Single source of truth for all IORS conversations across all channels.
 * Voice, SMS, WhatsApp, email, Messenger, Instagram, web chat — all merge here.
 *
 * Every channel appends messages here so Claude always has full cross-channel context.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ============================================================================
// TYPES
// ============================================================================

export type UnifiedChannel =
  | "voice"
  | "sms"
  | "whatsapp"
  | "email"
  | "messenger"
  | "instagram"
  | "web_chat"
  | "telegram"
  | "slack"
  | "discord"
  | "signal"
  | "imessage";

export type UnifiedRole = "user" | "assistant" | "system" | "tool";

export type UnifiedSourceType =
  | "voice_session"
  | "ghl_message"
  | "web_chat"
  | "intervention"
  | "email_import";

export interface UnifiedMessage {
  id: string;
  thread_id: string;
  tenant_id: string;
  role: UnifiedRole;
  content: string;
  channel: UnifiedChannel;
  direction?: "inbound" | "outbound";
  source_type?: UnifiedSourceType;
  source_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AppendMessageParams {
  role: UnifiedRole;
  content: string;
  channel: UnifiedChannel;
  direction?: "inbound" | "outbound";
  source_type?: UnifiedSourceType;
  source_id?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// THREAD MANAGEMENT
// ============================================================================

/**
 * Get or create the unified thread for a tenant.
 * Each tenant has exactly one thread (all channels merge here).
 *
 * Uses upsert with onConflict to avoid race conditions when two messages
 * arrive simultaneously for the same tenant — the database enforces
 * uniqueness atomically, so only one thread is ever created.
 */
export async function getOrCreateThread(tenantId: string): Promise<string> {
  const supabase = getServiceSupabase();

  // Atomic upsert: insert if no thread exists, do nothing on conflict.
  // The unique constraint on tenant_id ensures only one thread per tenant.
  // ignoreDuplicates: true makes this "INSERT ... ON CONFLICT DO NOTHING".
  const { data: upserted, error: upsertError } = await supabase
    .from("exo_unified_threads")
    .upsert(
      { tenant_id: tenantId },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    )
    .select("id")
    .single();

  if (upserted?.id) {
    return upserted.id;
  }

  // When ignoreDuplicates is true and the row already existed, some Supabase
  // versions return no rows (PGRST116) instead of the existing row.
  // Fall back to a select to retrieve the existing thread.
  if (upsertError && upsertError.code !== "PGRST116") {
    logger.error("[UnifiedThread] Upsert error:", {
      tenantId,
      error: upsertError.message,
      code: upsertError.code,
    });
  }

  const { data: existing, error: selectError } = await supabase
    .from("exo_unified_threads")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();

  if (existing?.id) {
    return existing.id;
  }

  logger.error("[UnifiedThread] Failed to get or create thread:", {
    tenantId,
    upsertError: upsertError?.message,
    selectError: selectError?.message,
  });
  throw new Error(
    `Failed to get or create unified thread for tenant ${tenantId}: ${selectError?.message || upsertError?.message}`,
  );
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Append a message to the unified thread.
 * Called by every channel (voice, chat, GHL webhook, interventions).
 */
export async function appendMessage(
  tenantId: string,
  params: AppendMessageParams,
): Promise<string> {
  const supabase = getServiceSupabase();

  const threadId = await getOrCreateThread(tenantId);

  const { data, error } = await supabase
    .from("exo_unified_messages")
    .insert({
      thread_id: threadId,
      tenant_id: tenantId,
      role: params.role,
      content: params.content,
      channel: params.channel,
      direction: params.direction,
      source_type: params.source_type,
      source_id: params.source_id,
      metadata: params.metadata,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[UnifiedThread] Error appending message:", {
      tenantId,
      channel: params.channel,
      role: params.role,
      error: error.message,
    });
    throw new Error(`Failed to append unified message: ${error.message}`);
  }

  // Fire-and-forget thread metadata update (non-critical, saves 1 round-trip)
  supabase
    .from("exo_unified_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_channel: params.channel,
    })
    .eq("id", threadId)
    .then(({ error: updateErr }) => {
      if (updateErr) {
        logger.error("[UnifiedThread] Metadata update failed:", {
          threadId,
          error: updateErr.message,
        });
      }
    });

  return data!.id;
}

/**
 * Get recent messages from the unified thread (all channels).
 */
export async function getRecentMessages(
  tenantId: string,
  limit: number = 20,
): Promise<UnifiedMessage[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_unified_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("[UnifiedThread] Error fetching messages:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  // Return in chronological order (oldest first)
  return (data || []).reverse();
}

/**
 * Get recent CONVERSATIONAL messages (filters out proactive CRON spam).
 * Loads a larger window, then keeps only messages that are part of actual
 * conversations (user-initiated exchanges). Proactive-only assistant messages
 * (nudges, goal reminders, overdue task alerts) are excluded.
 */
export async function getConversationalMessages(
  tenantId: string,
  limit: number = 20,
): Promise<UnifiedMessage[]> {
  const supabase = getServiceSupabase();

  // Load a bigger window to find actual conversations past CRON noise
  const fetchLimit = Math.max(limit * 5, 100);

  const { data, error } = await supabase
    .from("exo_unified_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    logger.error("[UnifiedThread] Error fetching conversational messages:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  if (!data || data.length === 0) return [];

  // Reverse to chronological order for processing
  const chronological = data.reverse();

  // Mark messages that are part of actual conversations:
  // A message is "conversational" if it's a user message, or an assistant message
  // that follows a user message within 2 minutes (a reply, not a proactive push).
  const conversational: UnifiedMessage[] = [];
  let lastUserTime: number | null = null;

  for (const msg of chronological) {
    const msgTime = new Date(msg.created_at).getTime();

    if (msg.role === "user") {
      lastUserTime = msgTime;
      conversational.push(msg);
    } else if (msg.role === "assistant") {
      // Include if: it's a reply to a user message (within 2 min)
      const isReply =
        lastUserTime !== null && msgTime - lastUserTime < 2 * 60 * 1000;
      if (isReply) {
        conversational.push(msg);
      }
      // Skip proactive messages (assistant-only, no recent user message)
    }
  }

  // Take the last N conversational messages
  return conversational.slice(-limit);
}

// ============================================================================
// CONTEXT BUILDER (for Claude)
// ============================================================================

/**
 * Max characters per individual message in thread context.
 * Messages exceeding this are truncated with a notice.
 * Prevents single huge paste (e.g., JSON dump) from blowing up the context.
 */
const MAX_MESSAGE_CHARS = 4000;

/**
 * Approximate character budget for the entire thread context.
 * ~100K chars ≈ 25K tokens — leaves room for system prompt + tools + response.
 */
const MAX_TOTAL_CHARS = 100_000;

/**
 * Build conversation context from unified thread for Claude.
 *
 * Returns formatted messages array ready for Anthropic API.
 * Includes channel annotations so Claude knows which channel each message came from.
 * Enforces per-message and total character budgets to prevent context overflow.
 */
export async function getThreadContext(
  tenantId: string,
  limit: number = 20,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages = await getRecentMessages(tenantId, limit);

  if (messages.length === 0) return [];

  const mapped = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      // Annotate with channel so Claude knows context source
      const channelTag = channelLabel(m.channel);
      const prefix = m.role === "user" ? `[${channelTag}] ` : "";
      let content = prefix + m.content;

      // Truncate oversized messages (e.g., pasted JSON dumps)
      if (content.length > MAX_MESSAGE_CHARS) {
        content =
          content.substring(0, MAX_MESSAGE_CHARS) +
          "\n[...wiadomość przycięta — oryginał za długi]";
      }

      return {
        role: m.role as "user" | "assistant",
        content,
      };
    });

  // Enforce total character budget — keep most recent messages, drop oldest
  let totalChars = mapped.reduce((sum, m) => sum + m.content.length, 0);
  const result = [...mapped];
  while (totalChars > MAX_TOTAL_CHARS && result.length > 2) {
    const removed = result.shift()!;
    totalChars -= removed.content.length;
  }

  // DEFENSIVE: Ensure strictly alternating roles (Anthropic API requirement)
  return enforceAlternatingRoles(result);
}

/**
 * Enforce strictly alternating user/assistant roles.
 * - Merges consecutive same-role messages (separated by newline)
 * - Ensures the array starts with a "user" role message
 * - Returns a clean array safe for Anthropic API
 */
function enforceAlternatingRoles(
  messages: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  if (messages.length === 0) return [];

  // Step 1: Merge consecutive same-role messages
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  // Step 2: Ensure first message is "user" (Anthropic requirement)
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }

  return merged;
}

/**
 * Build voice-optimized thread context with cross-channel mixing.
 *
 * Problem: getConversationalMessages(20) returns the most recent 20 messages,
 * which may all be from voice calls, pushing web_chat messages out of context.
 *
 * Solution: Fetch recent conversational messages AND recent non-voice messages
 * separately, merge them, deduplicate, and return a balanced mix.
 * This ensures voice calls always have web_chat/SMS/email context.
 */
export async function getVoiceThreadContext(
  tenantId: string,
  limit: number = 20,
): Promise<UnifiedMessage[]> {
  const supabase = getServiceSupabase();

  // Two parallel queries:
  // 1. Recent conversational messages (any channel) — current voice context
  // 2. Recent non-voice messages — cross-channel context the voice might miss
  const [convResult, crossChannelResult] = await Promise.allSettled([
    getConversationalMessages(tenantId, limit),
    supabase
      .from("exo_unified_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .neq("channel", "voice")
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const conversational =
    convResult.status === "fulfilled" ? convResult.value : [];
  const crossChannel =
    crossChannelResult.status === "fulfilled"
      ? (crossChannelResult.value.data || []).reverse()
      : [];

  // If conversational messages already include non-voice channels, we're fine
  const hasNonVoice = conversational.some((m) => m.channel !== "voice");
  if (hasNonVoice || crossChannel.length === 0) {
    return conversational.slice(-limit);
  }

  // Merge: deduplicate by ID, sort chronologically, take last N
  const seen = new Set<string>();
  const merged: UnifiedMessage[] = [];

  for (const msg of [...crossChannel, ...conversational]) {
    if (!seen.has(msg.id)) {
      seen.add(msg.id);
      merged.push(msg);
    }
  }

  merged.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return merged.slice(-limit);
}

/**
 * Get a summary string of recent activity across channels.
 * Useful for system prompt context injection.
 */
export async function getThreadSummary(tenantId: string): Promise<string> {
  const messages = await getRecentMessages(tenantId, 30);

  if (messages.length === 0) {
    return "Brak historii rozmow.";
  }

  // Count messages per channel
  const channelCounts: Record<string, number> = {};
  for (const m of messages) {
    channelCounts[m.channel] = (channelCounts[m.channel] || 0) + 1;
  }

  const channelSummary = Object.entries(channelCounts)
    .map(([ch, count]) => `${channelLabel(ch)}: ${count}`)
    .join(", ");

  const lastMsg = messages[messages.length - 1];
  const lastTime = new Date(lastMsg.created_at).toLocaleString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

  return `Ostatnie ${messages.length} wiadomosci (${channelSummary}). Ostatnia: ${lastTime} via ${channelLabel(lastMsg.channel)}.`;
}

// ============================================================================
// HELPERS
// ============================================================================

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    voice: "Telefon",
    sms: "SMS",
    whatsapp: "WhatsApp",
    email: "Email",
    messenger: "Messenger",
    instagram: "Instagram",
    web_chat: "Chat",
    telegram: "Telegram",
    slack: "Slack",
    discord: "Discord",
    signal: "Signal",
    imessage: "iMessage",
  };
  return labels[channel] || channel;
}
