/**
 * iMessage Channel Adapter
 *
 * Uses BlueBubbles Server API (macOS app exposing iMessage over HTTP).
 * Setup: Install BlueBubbles on macOS, configure webhook URL.
 */

import type { ChannelAdapter, GatewayMessage } from "../types";

import { logger } from "@/lib/logger";
const BLUEBUBBLES_URL = process.env.BLUEBUBBLES_URL; // e.g. "http://mac-server:1234"
const BLUEBUBBLES_PASSWORD = process.env.BLUEBUBBLES_PASSWORD;

// ============================================================================
// TYPES (BlueBubbles webhook payload)
// ============================================================================

interface BlueBubblesWebhookPayload {
  type: string; // "new-message", "updated-message", "typing-indicator"
  data: {
    guid: string; // unique message ID
    text: string;
    handle: {
      address: string; // phone or email (iMessage address)
      firstName?: string;
      lastName?: string;
    };
    isFromMe: boolean;
    dateCreated: number;
    attachments?: Array<{
      mimeType: string;
      transferName: string;
      guid: string;
    }>;
    chats: Array<{
      guid: string;
      chatIdentifier: string;
      displayName?: string;
    }>;
  };
}

// ============================================================================
// ADAPTER
// ============================================================================

export const imessageAdapter: ChannelAdapter = {
  channel: "imessage",

  parseInbound(rawPayload: unknown): GatewayMessage | null {
    if (!BLUEBUBBLES_URL) {
      logger.warn("[iMessage] BLUEBUBBLES_URL not set, skipping inbound");
      return null;
    }

    const payload = rawPayload as BlueBubblesWebhookPayload;

    // Only handle new messages
    if (payload?.type !== "new-message") return null;

    if (!payload.data) return null;

    // Skip our own outgoing messages
    if (payload.data.isFromMe) return null;

    const text = payload.data.text || "";
    const from = payload.data.handle?.address || "";

    if (!from) return null;

    // Build sender name
    const firstName = payload.data.handle?.firstName || "";
    const lastName = payload.data.handle?.lastName || "";
    const senderName =
      [firstName, lastName].filter(Boolean).join(" ") || undefined;

    // Determine media (first attachment only)
    let mediaUrl: string | undefined;
    let mediaType: GatewayMessage["mediaType"];

    if (payload.data.attachments && payload.data.attachments.length > 0) {
      const att = payload.data.attachments[0];
      mediaUrl = att.guid;
      if (att.mimeType.startsWith("image/")) mediaType = "image";
      else if (att.mimeType.startsWith("audio/")) mediaType = "audio";
      else if (att.mimeType.startsWith("video/")) mediaType = "video";
      else mediaType = "document";
    }

    // Skip if no text and no media
    if (!text && !mediaUrl) return null;

    return {
      channel: "imessage",
      tenantId: "unknown", // resolved by gateway
      from,
      senderName,
      text: text || `[${mediaType || "media"}]`,
      mediaUrl,
      mediaType,
      metadata: {
        imessage_guid: payload.data.guid,
        imessage_chat_guid: payload.data.chats?.[0]?.guid,
        imessage_chat_identifier: payload.data.chats?.[0]?.chatIdentifier,
        imessage_date: payload.data.dateCreated,
      },
    };
  },

  async sendResponse(to: string, text: string): Promise<void> {
    if (!BLUEBUBBLES_URL) {
      logger.error("[iMessage] BLUEBUBBLES_URL not set, cannot send");
      return;
    }

    if (!BLUEBUBBLES_PASSWORD) {
      logger.error("[iMessage] BLUEBUBBLES_PASSWORD not set, cannot send");
      return;
    }

    try {
      const response = await fetch(`${BLUEBUBBLES_URL}/api/v1/message/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BLUEBUBBLES_PASSWORD}`,
        },
        body: JSON.stringify({
          chatGuid: `iMessage;-;${to}`,
          message: text,
          method: "apple-script",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error("[iMessage] sendMessage failed:", {
          to,
          status: response.status,
          error: errorBody,
        });
      }
    } catch (error) {
      logger.error("[iMessage] sendMessage error:", {
        to,
        error: (error as Error).message,
      });
    }
  },
};
