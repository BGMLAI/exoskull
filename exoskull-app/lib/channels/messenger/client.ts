// =====================================================
// MESSENGER (FACEBOOK) API CLIENT
// Send API: https://developers.facebook.com/docs/messenger-platform/reference/send-api
// =====================================================

// =====================================================
// TYPES
// =====================================================

export interface MessengerSendResponse {
  recipient_id: string;
  message_id: string;
}

export interface MessengerProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  profile_pic?: string;
  locale?: string;
  timezone?: number;
  gender?: string;
}

export interface MessengerQuickReply {
  content_type: "text" | "user_phone_number" | "user_email";
  title?: string;
  payload?: string;
  image_url?: string;
}

export interface MessengerWebhookPayload {
  object: "page";
  entry: MessengerWebhookEntry[];
}

export interface MessengerWebhookEntry {
  id: string;
  time: number;
  messaging: MessengerMessagingEvent[];
}

export interface MessengerMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: "image" | "video" | "audio" | "file" | "location";
      payload: { url?: string; coordinates?: { lat: number; long: number } };
    }>;
    quick_reply?: { payload: string };
  };
  postback?: {
    title: string;
    payload: string;
  };
  delivery?: {
    mids: string[];
    watermark: number;
  };
  read?: {
    watermark: number;
  };
}

// =====================================================
// CLIENT
// =====================================================

const META_GRAPH_API_VERSION = "v18.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export class MessengerClient {
  private pageAccessToken: string;

  constructor(pageAccessToken: string) {
    this.pageAccessToken = pageAccessToken;
  }

  // =====================================================
  // CORE API
  // =====================================================

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" = "POST",
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${META_GRAPH_API_BASE}/${endpoint}`);
    url.searchParams.set("access_token", this.pageAccessToken);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[Messenger] API error:", {
          endpoint,
          status: response.status,
          error: data.error?.message || JSON.stringify(data),
          code: data.error?.code,
          subcode: data.error?.error_subcode,
        });
        throw new Error(
          `Messenger API error (${response.status}): ${data.error?.message || "Unknown error"}`,
        );
      }

      return data as T;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Messenger API error")
      ) {
        throw error;
      }
      console.error("[Messenger] Request failed:", {
        endpoint,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  // =====================================================
  // SEND MESSAGES
  // =====================================================

  /**
   * Send a plain text message to a user by PSID
   */
  async sendTextMessage(
    recipientId: string,
    text: string,
  ): Promise<MessengerSendResponse> {
    return this.request<MessengerSendResponse>("me/messages", "POST", {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    });
  }

  /**
   * Send a message with quick reply buttons
   */
  async sendQuickReplies(
    recipientId: string,
    text: string,
    replies: Array<{ title: string; payload: string }>,
  ): Promise<MessengerSendResponse> {
    const quickReplies: MessengerQuickReply[] = replies.map((r) => ({
      content_type: "text" as const,
      title: r.title,
      payload: r.payload,
    }));

    return this.request<MessengerSendResponse>("me/messages", "POST", {
      recipient: { id: recipientId },
      message: {
        text,
        quick_replies: quickReplies,
      },
      messaging_type: "RESPONSE",
    });
  }

  /**
   * Send typing indicator for better UX
   */
  async sendTypingOn(recipientId: string): Promise<void> {
    await this.request("me/messages", "POST", {
      recipient: { id: recipientId },
      sender_action: "typing_on",
    });
  }

  /**
   * Stop typing indicator
   */
  async sendTypingOff(recipientId: string): Promise<void> {
    await this.request("me/messages", "POST", {
      recipient: { id: recipientId },
      sender_action: "typing_off",
    });
  }

  // =====================================================
  // USER PROFILE
  // =====================================================

  /**
   * Get user profile information by PSID
   */
  async getProfile(userId: string): Promise<MessengerProfile> {
    return this.request<MessengerProfile>(userId, "GET", undefined, {
      fields: "id,first_name,last_name,profile_pic,locale,timezone",
    });
  }
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Extract the first text message from a Messenger webhook event
 */
export function extractMessagingEvent(payload: MessengerWebhookPayload): {
  senderPsid: string;
  text: string;
  messageId: string;
} | null {
  try {
    const entry = payload.entry?.[0];
    const event = entry?.messaging?.[0];

    if (!event?.message?.text) {
      return null;
    }

    return {
      senderPsid: event.sender.id,
      text: event.message.text,
      messageId: event.message.mid,
    };
  } catch (error) {
    console.error("[Messenger] Failed to extract messaging event:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

// =====================================================
// FACTORY (SINGLETON)
// =====================================================

let _messengerClient: MessengerClient | null = null;

/**
 * Get or create singleton Messenger client from env vars
 */
export function getMessengerClient(): MessengerClient | null {
  if (_messengerClient) return _messengerClient;

  const pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

  if (!pageAccessToken) {
    console.error("[Messenger] Missing env var: MESSENGER_PAGE_ACCESS_TOKEN");
    return null;
  }

  _messengerClient = new MessengerClient(pageAccessToken);
  return _messengerClient;
}
