import { logger } from "@/lib/logger";

// =====================================================
// WHATSAPP CLOUD API CLIENT
// Meta Graph API v18.0: https://developers.facebook.com/docs/whatsapp/cloud-api
// =====================================================

// =====================================================
// TYPES
// =====================================================

export interface WhatsAppTextMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppTemplateMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: WhatsAppTemplateComponent[];
  };
}

export interface WhatsAppTemplateComponent {
  type: "body" | "header" | "button";
  parameters: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document" | "video";
    text?: string;
  }>;
}

export interface WhatsAppMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product: "whatsapp";
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: Array<{
      profile: { name: string };
      wa_id: string;
    }>;
    messages?: WhatsAppIncomingMessage[];
    statuses?: WhatsAppMessageStatus[];
  };
  field: "messages";
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "reaction"
    | "interactive";
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; sha256?: string; caption?: string };
  document?: {
    id: string;
    mime_type: string;
    sha256?: string;
    filename?: string;
    caption?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface WhatsAppMessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}

// =====================================================
// CLIENT
// =====================================================

const META_GRAPH_API_VERSION = "v18.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export class WhatsAppClient {
  private token: string;
  private phoneNumberId: string;

  constructor(token: string, phoneNumberId: string) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
  }

  // =====================================================
  // CORE API
  // =====================================================

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" = "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${META_GRAPH_API_BASE}/${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[WhatsApp] API error:", {
          endpoint,
          status: response.status,
          error: data.error?.message || JSON.stringify(data),
          code: data.error?.code,
        });
        throw new Error(
          `WhatsApp API error (${response.status}): ${data.error?.message || "Unknown error"}`,
        );
      }

      return data as T;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("WhatsApp API error")
      ) {
        throw error;
      }
      logger.error("[WhatsApp] Request failed:", {
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
   * Send a plain text message
   */
  async sendTextMessage(
    to: string,
    text: string,
  ): Promise<WhatsAppMessageResponse> {
    const payload: WhatsAppTextMessage = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    };

    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      payload as unknown as Record<string, unknown>,
    );
  }

  /**
   * Send a template message (required for initiating conversations outside 24h window)
   */
  async sendTemplate(
    to: string,
    templateName: string,
    params?: string[],
    languageCode: string = "en",
  ): Promise<WhatsAppMessageResponse> {
    const components: WhatsAppTemplateComponent[] = params?.length
      ? [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text" as const, text })),
          },
        ]
      : [];

    const payload: WhatsAppTemplateMessage = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      payload as unknown as Record<string, unknown>,
    );
  }

  /**
   * Mark a message as read (sends blue ticks)
   */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    return this.request(`${this.phoneNumberId}/messages`, "POST", {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  // =====================================================
  // INTERACTIVE MESSAGES
  // =====================================================

  /**
   * Send interactive message with reply buttons (max 3)
   */
  async sendButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          ...(headerText ? { header: { type: "text", text: headerText } } : {}),
          body: { text: bodyText },
          ...(footerText ? { footer: { text: footerText } } : {}),
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
    );
  }

  /**
   * Send interactive list message (max 10 rows per section, max 10 sections)
   */
  async sendList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    headerText?: string,
    footerText?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          ...(headerText ? { header: { type: "text", text: headerText } } : {}),
          body: { text: bodyText },
          ...(footerText ? { footer: { text: footerText } } : {}),
          action: {
            button: buttonLabel,
            sections,
          },
        },
      },
    );
  }

  // =====================================================
  // MEDIA MESSAGES
  // =====================================================

  /**
   * Send image message by URL
   */
  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "image",
        image: { link: imageUrl, caption },
      },
    );
  }

  /**
   * Send document message by URL
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "document",
        document: { link: documentUrl, filename, caption },
      },
    );
  }

  /**
   * Send audio message by URL
   */
  async sendAudio(
    to: string,
    audioUrl: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "audio",
        audio: { link: audioUrl },
      },
    );
  }

  /**
   * Send video message by URL
   */
  async sendVideo(
    to: string,
    videoUrl: string,
    caption?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "video",
        video: { link: videoUrl, caption },
      },
    );
  }

  /**
   * Send location message
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<WhatsAppMessageResponse> {
    return this.request<WhatsAppMessageResponse>(
      `${this.phoneNumberId}/messages`,
      "POST",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "location",
        location: { latitude, longitude, name, address },
      },
    );
  }

  // =====================================================
  // MEDIA RETRIEVAL
  // =====================================================

  /**
   * Get media URL by media ID (for downloading incoming attachments)
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    const response = await this.request<{ url: string }>(mediaId, "GET");
    return response.url;
  }

  // =====================================================
  // BUSINESS PROFILE
  // =====================================================

  /**
   * Get WhatsApp Business Profile
   */
  async getBusinessProfile(): Promise<{
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    profile_picture_url?: string;
    websites?: string[];
  }> {
    const response = await this.request<{
      data: Array<Record<string, unknown>>;
    }>(
      `${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites`,
      "GET",
    );
    return (response.data?.[0] || {}) as {
      about?: string;
      address?: string;
      description?: string;
      email?: string;
      profile_picture_url?: string;
      websites?: string[];
    };
  }
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Extract incoming message details from webhook payload
 */
export function extractIncomingMessage(payload: WhatsAppWebhookPayload): {
  from: string;
  text: string;
  messageId: string;
  senderName: string;
  phoneNumberId: string;
  messageType: WhatsAppIncomingMessage["type"];
  raw: WhatsAppIncomingMessage;
} | null {
  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    // Extract text based on message type
    let text = "";
    switch (message.type) {
      case "text":
        text = message.text?.body || "";
        break;
      case "interactive":
        text = "[Interakcja]";
        break;
      case "image":
        text = message.image?.caption || "[Zdjecie]";
        break;
      case "video":
        text = message.video?.caption || "[Wideo]";
        break;
      case "audio":
        text = "[Wiadomosc glosowa]";
        break;
      case "document":
        text = message.document?.caption || "[Dokument]";
        break;
      case "location":
        text =
          `[Lokalizacja: ${message.location?.name || ""} ${message.location?.address || ""}]`.trim();
        break;
      case "reaction":
        text = "";
        break;
      default:
        text = `[${message.type}]`;
    }

    if (!text) return null;

    return {
      from: message.from,
      text,
      messageId: message.id,
      senderName: value.contacts?.[0]?.profile?.name || message.from,
      phoneNumberId: value.metadata?.phone_number_id || "",
      messageType: message.type,
      raw: message,
    };
  } catch (error) {
    logger.error("[WhatsApp] Failed to extract message:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

// =====================================================
// FACTORY (SINGLETON)
// =====================================================

let _whatsappClient: WhatsAppClient | null = null;

/**
 * Get or create singleton WhatsApp client from env vars
 */
export function getWhatsAppClient(): WhatsAppClient | null {
  if (_whatsappClient) return _whatsappClient;

  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    logger.error("[WhatsApp] Missing env vars:", {
      hasToken: !!token,
      hasPhoneNumberId: !!phoneNumberId,
    });
    return null;
  }

  _whatsappClient = new WhatsAppClient(token, phoneNumberId);
  return _whatsappClient;
}

/**
 * Create a WhatsApp client for a specific account (multi-page support).
 */
export function createWhatsAppClientForAccount(
  token: string,
  phoneNumberId: string,
): WhatsAppClient {
  return new WhatsAppClient(token, phoneNumberId);
}
