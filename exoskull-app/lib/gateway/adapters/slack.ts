/**
 * Slack Channel Adapter
 *
 * Uses Slack Events API + Web API.
 * Setup: Create Slack App → Event Subscriptions → Subscribe to bot events (message.im, app_mention)
 */

import crypto from "crypto";
import type { ChannelAdapter, GatewayMessage } from "../types";

import { logger } from "@/lib/logger";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// ============================================================================
// TYPES (Slack Events API subset)
// ============================================================================

interface SlackEventPayload {
  type: "url_verification" | "event_callback";
  challenge?: string; // for url_verification
  token?: string;
  event?: {
    type: string; // message, app_mention
    user?: string; // Slack user ID
    text?: string;
    channel?: string;
    ts?: string; // message timestamp (unique ID)
    thread_ts?: string; // thread parent
    bot_id?: string; // present if message from bot
    files?: Array<{
      url_private: string;
      mimetype: string;
      name: string;
    }>;
  };
}

// ============================================================================
// ADAPTER
// ============================================================================

export const slackAdapter: ChannelAdapter = {
  channel: "slack",

  parseInbound(rawPayload: unknown): GatewayMessage | null {
    const payload = rawPayload as SlackEventPayload;

    // Skip url_verification (handled separately in route)
    if (payload.type === "url_verification") return null;

    const event = payload.event;
    if (!event) return null;

    // Only handle direct messages and mentions
    if (event.type !== "message" && event.type !== "app_mention") return null;

    // Skip bot messages (prevent echo loop)
    if (event.bot_id) return null;

    // Skip empty messages
    if (!event.text && !event.files?.length) return null;

    // Determine media
    let mediaUrl: string | undefined;
    let mediaType: GatewayMessage["mediaType"];

    if (event.files && event.files.length > 0) {
      const file = event.files[0];
      mediaUrl = file.url_private;
      if (file.mimetype.startsWith("image/")) mediaType = "image";
      else if (file.mimetype.startsWith("audio/")) mediaType = "audio";
      else if (file.mimetype.startsWith("video/")) mediaType = "video";
      else mediaType = "document";
    }

    // Strip bot mention from text (e.g., "<@U123456> hello" → "hello")
    const cleanText = (event.text || "").replace(/<@[A-Z0-9]+>\s*/g, "").trim();

    return {
      channel: "slack",
      tenantId: "unknown", // resolved by gateway
      from: event.user || "unknown",
      senderName: undefined, // Slack doesn't send name in events; could fetch via users.info
      text: cleanText || `[${mediaType || "file"}]`,
      mediaUrl,
      mediaType,
      replyToId: event.thread_ts,
      metadata: {
        slack_channel_id: event.channel,
        slack_user_id: event.user,
        slack_ts: event.ts,
        slack_thread_ts: event.thread_ts,
      },
    };
  },

  async sendResponse(
    to: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!SLACK_BOT_TOKEN) {
      logger.error("[Slack] SLACK_BOT_TOKEN not set");
      return;
    }

    const channelId = (metadata?.slack_channel_id as string) || to;
    const threadTs = metadata?.slack_thread_ts as string | undefined;

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: channelId,
        text,
        thread_ts: threadTs, // reply in thread if applicable
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Slack] chat.postMessage failed:", {
        channel: channelId,
        status: response.status,
        error,
      });
    } else {
      const result = await response.json();
      if (!result.ok) {
        logger.error("[Slack] API error:", result.error);
      }
    }
  },

  async verifyWebhook(req: Request): Promise<boolean> {
    if (!SLACK_SIGNING_SECRET) return false;

    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signature = req.headers.get("x-slack-signature");

    if (!timestamp || !signature) return false;

    // Check timestamp freshness (5 min window)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const body = await req.clone().text();
    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature =
      "v0=" +
      crypto
        .createHmac("sha256", SLACK_SIGNING_SECRET)
        .update(sigBasestring)
        .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature),
    );
  },
};
