/**
 * Telegram Channel Adapter
 *
 * Uses Telegram Bot API via HTTPS webhooks.
 * Setup: Create bot via @BotFather, set webhook URL.
 */

import type { ChannelAdapter, GatewayMessage } from "../types";

import { logger } from "@/lib/logger";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ============================================================================
// TYPES (Telegram Bot API subset)
// ============================================================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
    voice?: { file_id: string; duration: number };
    document?: { file_id: string; file_name?: string };
    audio?: { file_id: string; duration: number };
    video?: { file_id: string; duration: number };
    reply_to_message?: { message_id: number };
  };
}

// ============================================================================
// ADAPTER
// ============================================================================

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",

  parseInbound(rawPayload: unknown): GatewayMessage | null {
    const update = rawPayload as TelegramUpdate;

    if (!update.message) return null;

    const msg = update.message;
    const text = msg.text || "";
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || "";
    const lastName = msg.from?.last_name || "";
    const senderName =
      [firstName, lastName].filter(Boolean).join(" ") || "Telegram User";

    // Determine media
    let mediaUrl: string | undefined;
    let mediaType: GatewayMessage["mediaType"];

    if (msg.photo && msg.photo.length > 0) {
      // Use largest photo
      mediaUrl = msg.photo[msg.photo.length - 1].file_id;
      mediaType = "image";
    } else if (msg.voice) {
      mediaUrl = msg.voice.file_id;
      mediaType = "audio";
    } else if (msg.document) {
      mediaUrl = msg.document.file_id;
      mediaType = "document";
    } else if (msg.video) {
      mediaUrl = msg.video.file_id;
      mediaType = "video";
    } else if (msg.audio) {
      mediaUrl = msg.audio.file_id;
      mediaType = "audio";
    }

    // Skip if no text and no caption-like content
    if (!text && !mediaUrl) return null;

    return {
      channel: "telegram",
      tenantId: "unknown", // resolved by gateway
      from: chatId,
      senderName,
      text: text || `[${mediaType || "media"}]`,
      mediaUrl,
      mediaType,
      replyToId: msg.reply_to_message
        ? String(msg.reply_to_message.message_id)
        : undefined,
      metadata: {
        telegram_message_id: msg.message_id,
        telegram_chat_id: chatId,
        telegram_user_id: msg.from?.id,
        telegram_username: msg.from?.username,
      },
    };
  },

  async sendResponse(to: string, text: string): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
      logger.error("[Telegram] TELEGRAM_BOT_TOKEN not set");
      return;
    }

    // Split long messages (Telegram limit: 4096 chars)
    const chunks = splitMessage(text, 4096);

    for (const chunk of chunks) {
      const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: to,
          text: chunk,
          parse_mode: "Markdown",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error("[Telegram] sendMessage failed:", {
          chatId: to,
          status: response.status,
          error: errorBody,
        });

        // Retry without Markdown if parse mode fails
        if (response.status === 400 && errorBody.includes("parse")) {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: to, text: chunk }),
          });
        }
      }
    }
  },
};

// ============================================================================
// WEBHOOK SETUP HELPER
// ============================================================================

/**
 * Register the webhook URL with Telegram.
 * Call this once during setup: POST /api/gateway/telegram?action=setup
 */
export async function setupTelegramWebhook(
  webhookUrl: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error("[Telegram] Cannot setup webhook: TELEGRAM_BOT_TOKEN not set");
    return false;
  }

  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message"],
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    }),
  });

  const result = await response.json();
  logger.info("[Telegram] Webhook setup:", result);
  return result.ok === true;
}

// ============================================================================
// HELPERS
// ============================================================================

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < maxLength / 2) {
      // Try newline
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt < maxLength / 2) {
      // Try space
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt < maxLength / 2) {
      // Hard split
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
