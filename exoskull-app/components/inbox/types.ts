export interface UnifiedMessage {
  id: string;
  thread_id: string;
  tenant_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  channel:
    | "voice"
    | "sms"
    | "whatsapp"
    | "email"
    | "messenger"
    | "instagram"
    | "web_chat";
  direction?: "inbound" | "outbound";
  source_type?: string;
  source_id?: string;
  metadata?: {
    from?: string;
    to?: string;
    subject?: string;
    isUnread?: boolean;
    date?: string;
    [key: string]: unknown;
  };
  created_at: string;
}
