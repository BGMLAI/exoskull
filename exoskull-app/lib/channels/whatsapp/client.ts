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
        console.error("[WhatsApp] API error:", {
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
      console.error("[WhatsApp] Request failed:", {
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
} | null {
  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== "text" || !message.text?.body) {
      return null;
    }

    return {
      from: message.from,
      text: message.text.body,
      messageId: message.id,
      senderName: value.contacts?.[0]?.profile?.name || message.from,
      phoneNumberId: value.metadata?.phone_number_id || "",
    };
  } catch (error) {
    console.error("[WhatsApp] Failed to extract message:", {
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
    console.error("[WhatsApp] Missing env vars:", {
      hasToken: !!token,
      hasPhoneNumberId: !!phoneNumberId,
    });
    return null;
  }

  _whatsappClient = new WhatsAppClient(token, phoneNumberId);
  return _whatsappClient;
}
