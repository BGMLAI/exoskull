/**
 * Email Analysis System — Shared Types
 */

// ============================================================================
// Database row types
// ============================================================================

export interface EmailAccount {
  id: string;
  tenant_id: string;
  provider: "gmail" | "outlook" | "imap";
  email_address: string;
  display_name: string | null;
  rig_connection_id: string | null;
  imap_host: string | null;
  imap_port: number;
  imap_user: string | null;
  imap_password_encrypted: string | null;
  imap_use_tls: boolean;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_sync_message_id: string | null;
  sync_error: string | null;
  emails_synced: number;
  sync_frequency: "5min" | "15min" | "30min" | "1hour";
  analyze_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyzedEmail {
  id: string;
  tenant_id: string;
  account_id: string;
  provider_message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_name: string | null;
  from_email: string;
  to_emails: string[];
  cc_emails: string[];
  date_received: string;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  has_attachments: boolean;
  attachment_names: string[];
  direction: "inbound" | "outbound" | "self";
  is_read: boolean;
  is_replied: boolean;
  analysis_status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "skipped";
  analyzed_at: string | null;
  category: string | null;
  subcategory: string | null;
  priority: "urgent" | "high" | "normal" | "low" | "ignore";
  priority_score: number;
  action_items: ActionItem[];
  key_facts: KeyFact[];
  follow_up_needed: boolean;
  follow_up_by: string | null;
  sentiment: string | null;
  knowledge_extracted: boolean;
  knowledge_chunk_ids: string[];
  tasks_generated: string[];
  labels: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SenderProfile {
  id: string;
  tenant_id: string;
  email_address: string;
  display_name: string | null;
  relationship: string;
  domain: string | null;
  importance_score: number;
  emails_received: number;
  emails_sent: number;
  avg_response_time_hours: number | null;
  last_email_at: string | null;
  first_email_at: string | null;
  user_always_reads: boolean | null;
  user_usually_ignores: boolean | null;
  user_replies_quickly: boolean | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Analysis types
// ============================================================================

export interface ActionItem {
  text: string;
  due_date?: string;
  assignee?: string;
  created_task_id?: string;
}

export interface KeyFact {
  fact: string;
  confidence: number;
  stored_in_rag?: boolean;
}

export interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface RawEmail {
  messageId: string;
  threadId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  dateReceived: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachmentNames: string[];
  attachmentMetadata?: AttachmentMeta[];
  labels?: string[];
}

export interface SyncResult {
  accountId: string;
  provider: string;
  newEmails: number;
  errors: number;
  lastMessageId?: string;
}

export interface AnalysisResult {
  emailsProcessed: number;
  classified: number;
  deepAnalyzed: number;
  insightsGenerated: number;
  tasksCreated: number;
  errors: number;
}

export interface ClassificationResult {
  category: string;
  subcategory: string;
  priority: "urgent" | "high" | "normal" | "low" | "ignore";
  priority_score: number;
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  follow_up_needed: boolean;
  follow_up_days?: number;
}

export interface DeepAnalysisResult {
  action_items: ActionItem[];
  key_facts: KeyFact[];
  follow_up_by?: string;
  sentiment_detail: string;
  summary: string;
}
