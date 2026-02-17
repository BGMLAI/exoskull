/**
 * Signal Channel Adapter
 *
 * Uses signal-cli REST API (Docker container: signal-cli-rest-api).
 * Setup: Run signal-cli-rest-api container, register phone number, set webhook.
 */

import type { ChannelAdapter, GatewayMessage } from "../types";

import { logger } from "@/lib/logger";
const SIGNAL_API_URL = process.env.SIGNAL_API_URL; // e.g. "http://signal-bridge:8080"
const SIGNAL_SENDER = process.env.SIGNAL_SENDER_NUMBER; // registered Signal phone number

// ============================================================================
// TYPES (signal-cli REST API webhook payload)
// ============================================================================

interface SignalInboundMessage {
  envelope: {
    source: string; // sender phone number (e.g. "+48123456789")
    sourceDevice: number;
    timestamp: number;
    syncMessage?: unknown;
    dataMessage?: {
      timestamp: number;
      message: string;
      groupInfo?: { groupId: string };
      attachments?: Array<{
        contentType: string;
        filename?: string;
        id: string;
        size: number;
      }>;
    };
  };
  account: string; // our registered number
}

// ============================================================================
// ADAPTER
// ============================================================================

export const signalAdapter: ChannelAdapter = {
  channel: "signal",

  parseInbound(rawPayload: unknown): GatewayMessage | null {
    if (!SIGNAL_API_URL) {
      logger.warn("[Signal] SIGNAL_API_URL not set, skipping inbound");
      return null;
    }

    const payload = rawPayload as SignalInboundMessage;

    if (!payload?.envelope) return null;

    const { envelope } = payload;

    // Skip syncMessages (our own outgoing messages echoed back)
    if (envelope.syncMessage) return null;

    // Skip if no data message (e.g. receipt, typing indicator)
    if (!envelope.dataMessage) return null;

    // Skip group messages — only handle 1:1 DMs
    if (envelope.dataMessage.groupInfo) return null;

    const text = envelope.dataMessage.message || "";
    const from = envelope.source;

    // Determine media (first attachment only)
    let mediaUrl: string | undefined;
    let mediaType: GatewayMessage["mediaType"];

    if (
      envelope.dataMessage.attachments &&
      envelope.dataMessage.attachments.length > 0
    ) {
      const att = envelope.dataMessage.attachments[0];
      mediaUrl = att.id;
      if (att.contentType.startsWith("image/")) mediaType = "image";
      else if (att.contentType.startsWith("audio/")) mediaType = "audio";
      else if (att.contentType.startsWith("video/")) mediaType = "video";
      else mediaType = "document";
    }

    // Skip if no text and no media
    if (!text && !mediaUrl) return null;

    return {
      channel: "signal",
      tenantId: "unknown", // resolved by gateway
      from,
      text: text || `[${mediaType || "media"}]`,
      mediaUrl,
      mediaType,
      metadata: {
        signal_sender: from,
        signal_timestamp: envelope.timestamp,
        signal_account: payload.account,
      },
    };
  },

  async sendResponse(to: string, text: string): Promise<void> {
    if (!SIGNAL_API_URL) {
      logger.error("[Signal] SIGNAL_API_URL not set, cannot send");
      return;
    }

    if (!SIGNAL_SENDER) {
      logger.error("[Signal] SIGNAL_SENDER_NUMBER not set, cannot send");
      return;
    }

    try {
      const response = await fetch(`${SIGNAL_API_URL}/v2/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          number: SIGNAL_SENDER,
          recipients: [to],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error("[Signal] sendMessage failed:", {
          to,
          status: response.status,
          error: errorBody,
        });
      }
    } catch (error) {
      logger.error("[Signal] sendMessage error:", {
        to,
        error: (error as Error).message,
      });
    }
  },
};
