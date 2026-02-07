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

import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
  findTenantByPhone,
} from "../voice/conversation-handler";
import { appendMessage } from "../unified-thread";
import { isBirthPending, handleBirthMessage } from "@/lib/iors/birth-flow";
import { findOrCreateLead, handleLeadMessage } from "@/lib/iors/lead-manager";
import { classifyMessage } from "../async-tasks/classifier";
import { createTask, getLatestPendingTask } from "../async-tasks/queue";
import type { GatewayChannel, GatewayMessage, GatewayResponse } from "./types";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emitEvent } from "@/lib/iors/loop";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
  const supabase = getServiceSupabase();

  // Channel-specific lookup
  const channelColumn: Record<string, string> = {
    telegram: "telegram_chat_id",
    slack: "slack_user_id",
    discord: "discord_user_id",
    whatsapp: "phone",
    sms: "phone",
    voice: "phone",
    email: "email",
    signal: "signal_phone",
    imessage: "imessage_address",
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
  if (["whatsapp", "sms", "voice", "signal"].includes(channel)) {
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
  const supabase = getServiceSupabase();

  const channelColumn: Record<string, string> = {
    telegram: "telegram_chat_id",
    slack: "slack_user_id",
    discord: "discord_user_id",
    whatsapp: "phone",
    sms: "phone",
    email: "email",
    signal: "signal_phone",
    imessage: "imessage_address",
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
 * 3. IORS birth check (new users → birth flow with full tool access)
 * 4. Status check (if user asks about pending async task)
 * 5. Classify: sync or async?
 *    - Async → queue task, return ack, CRON processes later
 *    - Sync → processUserMessage with 40s timeout safety net
 *      - If timeout → escalate to async queue
 * 6. Update session + append outbound to unified thread
 * 7. Return response for adapter to send back
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
        // Unknown sender — try lead system first (lightweight Tier 1 conversation)
        try {
          const leadResult = await findOrCreateLead(
            msg.channel,
            msg.from,
            msg.senderName,
          );
          if (leadResult) {
            return await handleLeadMessage(
              leadResult.lead,
              msg.text,
              msg.channel,
            );
          }
        } catch (leadErr) {
          console.error("[Gateway] Lead system failed, falling back:", {
            error: leadErr instanceof Error ? leadErr.message : leadErr,
          });
        }
        // Fallback: auto-register new user
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

    // 3a. IORS Birth Flow — new IORS birth (full pipeline with tools)
    // Skip for web_chat (has own UI) and voice (synchronous)
    if (msg.channel !== "web_chat" && msg.channel !== "voice") {
      const birthPending = await isBirthPending(tenantId);
      if (birthPending) {
        const birthResult = await handleBirthMessage(
          tenantId,
          msg.text,
          msg.channel,
        );

        // Append assistant response to unified thread
        await appendMessage(tenantId, {
          role: "assistant",
          content: birthResult.text,
          channel: unifiedChannel,
          direction: "outbound",
          metadata: {
            gateway_channel: msg.channel,
            iors_birth: true,
          },
        });

        const durationMs = Date.now() - startTime;
        console.log("[Gateway] Birth message processed:", {
          channel: msg.channel,
          tenantId,
          durationMs,
        });

        return birthResult;
      }
    }

    // 4. Check for pending async task status queries
    const STATUS_CHECK =
      /\b(status|jak idzie|gotowe|juz|już|finished|done\??)\b/i;
    if (STATUS_CHECK.test(msg.text)) {
      const pendingTask = await getLatestPendingTask(tenantId);
      if (pendingTask) {
        const snippet =
          pendingTask.prompt.length > 50
            ? pendingTask.prompt.substring(0, 50) + "..."
            : pendingTask.prompt;
        const statusText =
          pendingTask.status === "processing"
            ? `Jeszcze pracuję nad: "${snippet}". Dam znać jak skończę.`
            : `Twoje zapytanie "${snippet}" czeka w kolejce. Zaraz się tym zajmę.`;
        return {
          text: statusText,
          toolsUsed: ["async_status_check"],
          channel: msg.channel,
        };
      }
    }

    // 5. Classify: sync or async?
    const sessionId = `${msg.channel}-${tenantId}-${new Date().toISOString().slice(0, 10)}`;
    const classification = classifyMessage(msg.text);

    if (classification.mode === "async") {
      // Queue for background processing
      const taskId = await createTask({
        tenantId,
        channel: msg.channel,
        channelMetadata: msg.metadata,
        replyTo: msg.from,
        prompt: msg.text,
        sessionId,
      });

      console.log("[Gateway] Queued async task:", {
        taskId,
        channel: msg.channel,
        reason: classification.reason,
      });

      // Fire-and-forget wakeup call to CRON worker for immediate processing
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
      if (appUrl && process.env.CRON_SECRET) {
        fetch(
          `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/cron/async-tasks`,
          {
            headers: { "x-cron-secret": process.env.CRON_SECRET },
          },
        ).catch((err) => {
          console.warn(
            "[Gateway] CRON wakeup failed:",
            err instanceof Error ? err.message : String(err),
          );
        });
      }

      return {
        text: "Przyjęto, dam znać jak skończę. Może to chwilę zająć.",
        toolsUsed: ["async_queue"],
        channel: msg.channel,
      };
    }

    // 6. Sync path: process with timeout safety net
    const session = await getOrCreateSession(sessionId, tenantId);

    const SYNC_TIMEOUT_MS = 40_000; // 40s — leaves 20s buffer before Vercel's 60s
    const result = await Promise.race([
      processUserMessage(session, msg.text),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SYNC_TIMEOUT_MS),
      ),
    ]);

    // Timeout — escalate to async queue
    if (result === null) {
      const taskId = await createTask({
        tenantId,
        channel: msg.channel,
        channelMetadata: msg.metadata,
        replyTo: msg.from,
        prompt: msg.text,
        sessionId,
      });

      console.log("[Gateway] Sync timed out, escalated to async:", {
        taskId,
        channel: msg.channel,
        elapsed: Date.now() - startTime,
      });

      // Wakeup CRON
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
      if (appUrl && process.env.CRON_SECRET) {
        fetch(
          `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/cron/async-tasks`,
          {
            headers: { "x-cron-secret": process.env.CRON_SECRET },
          },
        ).catch((err) => {
          console.warn(
            "[Gateway] CRON wakeup failed:",
            err instanceof Error ? err.message : String(err),
          );
        });
      }

      return {
        text: "To zajmie więcej czasu niż myślałem. Przetwarzam w tle — dam znać jak skończę.",
        toolsUsed: ["async_queue_timeout"],
        channel: msg.channel,
      };
    }

    // 7. Update session + append outbound to unified thread
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

    // Emit data_ingested event for Pętla loop
    emitEvent({
      tenantId,
      eventType: "data_ingested",
      priority: 3,
      source: "gateway",
      payload: {
        channel: msg.channel,
        durationMs,
        toolsUsed: result.toolsUsed,
      },
      dedupKey: `gateway:msg:${tenantId}:${new Date().toISOString().slice(0, 16)}`,
    }).catch((err) => console.error("[Gateway] emitEvent failed:", err));

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
