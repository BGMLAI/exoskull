/**
 * Unified Message Gateway — Core
 *
 * Central routing for ALL inbound messages.
 * Every channel adapter calls handleInboundMessage() which:
 * 1. Appends to unified thread (inbound)
 * 2. Runs full AI pipeline (processUserMessage + 28 tools)
 * 3. Appends to unified thread (outbound)
 * 4. Returns response for adapter to send back
 */

import { createClient } from "@supabase/supabase-js";
import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
  findTenantByPhone,
} from "../voice/conversation-handler";
import { appendMessage } from "../unified-thread";
import type { GatewayChannel, GatewayMessage, GatewayResponse } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Map GatewayChannel → UnifiedChannel for unified-thread.ts
// Now that UnifiedChannel includes telegram/slack/discord, this is a direct pass-through
function toUnifiedChannel(
  ch: GatewayChannel,
): import("../unified-thread").UnifiedChannel {
  return ch as import("../unified-thread").UnifiedChannel;
}

/**
 * Resolve tenant from channel-specific sender ID.
 * Tries channel-specific lookup first, then falls back to phone.
 */
export async function resolveTenant(
  channel: GatewayChannel,
  from: string,
  senderName?: string,
): Promise<{ tenantId: string; name: string } | null> {
  const supabase = getSupabase();

  // Channel-specific lookup
  const channelColumn: Record<string, string> = {
    telegram: "telegram_chat_id",
    slack: "slack_user_id",
    discord: "discord_user_id",
    whatsapp: "phone",
    sms: "phone",
    voice: "phone",
    email: "email",
  };

  const column = channelColumn[channel];
  if (column) {
    const { data } = await supabase
      .from("exo_tenants")
      .select("id, first_name")
      .eq(column, from)
      .single();

    if (data) {
      return {
        tenantId: data.id,
        name: data.first_name || senderName || "User",
      };
    }
  }

  // Fallback: phone-based lookup for phone-like channels
  if (["whatsapp", "sms", "voice"].includes(channel)) {
    const tenant = await findTenantByPhone(from);
    if (tenant)
      return { tenantId: tenant.id, name: tenant.name || senderName || "User" };
  }

  return null;
}

/**
 * Auto-register a new tenant from a messaging channel.
 * Creates a minimal tenant record so the user can start chatting immediately.
 */
async function autoRegisterTenant(
  channel: GatewayChannel,
  from: string,
  senderName?: string,
): Promise<string> {
  const supabase = getSupabase();

  const channelColumn: Record<string, string> = {
    telegram: "telegram_chat_id",
    slack: "slack_user_id",
    discord: "discord_user_id",
    whatsapp: "phone",
    sms: "phone",
    email: "email",
  };

  const insertData: Record<string, unknown> = {
    first_name: senderName || "New User",
    preferred_channel: channel,
    onboarding_status: "pending",
  };

  const column = channelColumn[channel];
  if (column) {
    insertData[column] = from;
  }

  const { data, error } = await supabase
    .from("exo_tenants")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    console.error("[Gateway] Auto-register failed:", {
      channel,
      from,
      error: error.message,
    });
    throw new Error(`Failed to auto-register tenant: ${error.message}`);
  }

  console.log("[Gateway] Auto-registered tenant:", {
    tenantId: data!.id,
    channel,
    from,
    name: senderName,
  });

  return data!.id;
}

/**
 * Main entry point for ALL inbound messages.
 *
 * Flow:
 * 1. Resolve or auto-register tenant
 * 2. Append inbound message to unified thread
 * 3. Get/create session + run processUserMessage (full AI pipeline)
 * 4. Append assistant response to unified thread
 * 5. Return response for adapter to send back
 */
export async function handleInboundMessage(
  msg: GatewayMessage,
): Promise<GatewayResponse> {
  const startTime = Date.now();

  try {
    // 1. Resolve tenant
    let tenantId = msg.tenantId;
    if (!tenantId || tenantId === "unknown") {
      const tenant = await resolveTenant(msg.channel, msg.from, msg.senderName);
      if (tenant) {
        tenantId = tenant.tenantId;
      } else {
        // Auto-register new user
        tenantId = await autoRegisterTenant(
          msg.channel,
          msg.from,
          msg.senderName,
        );
      }
    }

    // 2. Append inbound message to unified thread
    const unifiedChannel = toUnifiedChannel(msg.channel);
    await appendMessage(tenantId, {
      role: "user",
      content: msg.text,
      channel: unifiedChannel,
      direction: "inbound",
      source_type: "web_chat", // generic source for messaging channels
      metadata: {
        gateway_channel: msg.channel, // preserve actual channel
        from: msg.from,
        sender_name: msg.senderName,
        ...msg.metadata,
      },
    });

    // 3. Get or create session + process with full AI pipeline
    const sessionId = `${msg.channel}-${tenantId}-${new Date().toISOString().slice(0, 10)}`;
    const session = await getOrCreateSession(sessionId, tenantId);
    const result = await processUserMessage(session, msg.text);

    // 4. Update session + append outbound to unified thread
    // updateSession only accepts "voice" | "web_chat", map other channels to "web_chat"
    const sessionChannel: "voice" | "web_chat" =
      msg.channel === "voice" ? "voice" : "web_chat";
    await updateSession(session.id, msg.text, result.text, {
      channel: sessionChannel,
    });

    const durationMs = Date.now() - startTime;
    console.log("[Gateway] Message processed:", {
      channel: msg.channel,
      tenantId,
      toolsUsed: result.toolsUsed,
      durationMs,
    });

    return {
      text: result.text,
      toolsUsed: result.toolsUsed,
      channel: msg.channel,
    };
  } catch (error) {
    const err = error as Error;
    console.error("[Gateway] handleInboundMessage failed:", {
      channel: msg.channel,
      from: msg.from,
      error: err.message,
      stack: err.stack,
    });

    return {
      text: "Przepraszam, wystąpił błąd. Spróbuj ponownie za chwilę.",
      toolsUsed: [],
      channel: msg.channel,
    };
  }
}

/**
 * Send an outbound message via any channel adapter.
 * Used by CRON jobs, interventions, proactive messages.
 */
export async function sendOutbound(
  channel: GatewayChannel,
  tenantId: string,
  to: string,
  text: string,
  adapter: { sendResponse: (to: string, text: string) => Promise<void> },
): Promise<void> {
  // Append to unified thread
  const unifiedChannel = toUnifiedChannel(channel);
  await appendMessage(tenantId, {
    role: "assistant",
    content: text,
    channel: unifiedChannel,
    direction: "outbound",
    metadata: { gateway_channel: channel, to },
  });

  // Send via adapter
  await adapter.sendResponse(to, text);
}
