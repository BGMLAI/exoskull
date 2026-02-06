/**
 * Unified Conversation Thread
 *
 * Single source of truth for all IORS conversations across all channels.
 * Voice, SMS, WhatsApp, email, Messenger, Instagram, web chat — all merge here.
 *
 * Every channel appends messages here so Claude always has full cross-channel context.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

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
 */
export async function getOrCreateThread(tenantId: string): Promise<string> {
  const supabase = getSupabase();

  // Try to find existing thread
  const { data: existing, error: selectError } = await supabase
    .from("exo_unified_threads")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();

  if (existing?.id) {
    return existing.id;
  }

  if (selectError && selectError.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for new tenants)
    console.error("[UnifiedThread] Error finding thread:", {
      tenantId,
      error: selectError.message,
    });
  }

  // Create new thread
  const { data: created, error: insertError } = await supabase
    .from("exo_unified_threads")
    .insert({ tenant_id: tenantId })
    .select("id")
    .single();

  if (insertError) {
    // Race condition: another request created the thread
    if (insertError.code === "23505") {
      const { data: retry } = await supabase
        .from("exo_unified_threads")
        .select("id")
        .eq("tenant_id", tenantId)
        .single();

      if (retry?.id) return retry.id;
    }

    console.error("[UnifiedThread] Error creating thread:", {
      tenantId,
      error: insertError.message,
    });
    throw new Error(`Failed to create unified thread: ${insertError.message}`);
  }

  return created!.id;
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
  const supabase = getSupabase();

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
    console.error("[UnifiedThread] Error appending message:", {
      tenantId,
      channel: params.channel,
      role: params.role,
      error: error.message,
    });
    throw new Error(`Failed to append unified message: ${error.message}`);
  }

  // Update thread metadata
  await supabase
    .from("exo_unified_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_channel: params.channel,
    })
    .eq("id", threadId);

  return data!.id;
}

/**
 * Get recent messages from the unified thread (all channels).
 */
export async function getRecentMessages(
  tenantId: string,
  limit: number = 20,
): Promise<UnifiedMessage[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("exo_unified_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[UnifiedThread] Error fetching messages:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  // Return in chronological order (oldest first)
  return (data || []).reverse();
}

// ============================================================================
// CONTEXT BUILDER (for Claude)
// ============================================================================

/**
 * Build conversation context from unified thread for Claude.
 *
 * Returns formatted messages array ready for Anthropic API.
 * Includes channel annotations so Claude knows which channel each message came from.
 */
export async function getThreadContext(
  tenantId: string,
  limit: number = 20,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages = await getRecentMessages(tenantId, limit);

  if (messages.length === 0) return [];

  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      // Annotate with channel so Claude knows context source
      const channelTag = channelLabel(m.channel);
      const prefix = m.role === "user" ? `[${channelTag}] ` : "";

      return {
        role: m.role as "user" | "assistant",
        content: prefix + m.content,
      };
    });
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
