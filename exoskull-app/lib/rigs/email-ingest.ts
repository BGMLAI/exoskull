/**
 * Email Ingestion Module
 *
 * Ingests emails from Gmail/Outlook into the unified thread.
 * Handles deduplication by source_id.
 */

import { appendMessage } from "../unified-thread";
import { GmailMessage } from "./google-workspace/client";
import { OutlookMessage } from "./microsoft-365/client";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";

export interface EmailIngestionResult {
  ingested: number;
  skipped: number;
  errors: number;
}

/**
 * Check if an email is already ingested (by source_id)
 */
async function isEmailAlreadyIngested(
  tenantId: string,
  emailId: string,
): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from("exo_unified_messages")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .eq("source_id", emailId);

  if (error) {
    logger.error(
      "[EmailIngest] Dedup check failed, assuming already ingested:",
      {
        tenantId,
        emailId,
        error: error.message,
      },
    );
    return true; // Safe default: skip rather than duplicate
  }

  return (count || 0) > 0;
}

/**
 * Parse email address from "Name <email@example.com>" format
 */
function parseFromField(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  }
  return { name: "", email: from };
}

/**
 * Extract just the email address from a from field
 */
function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

/**
 * Format Gmail message for unified thread
 */
function formatGmailContent(email: GmailMessage): string {
  const sender = parseFromField(email.from);
  const senderDisplay = sender.name || sender.email;

  return `[Email] Od: ${senderDisplay}
Temat: ${email.subject || "(brak tematu)"}
---
${email.snippet}`;
}

/**
 * Format Outlook message for unified thread
 */
function formatOutlookContent(email: OutlookMessage): string {
  const senderDisplay =
    email.from.emailAddress.name || email.from.emailAddress.address;

  return `[Email] Od: ${senderDisplay}
Temat: ${email.subject || "(brak tematu)"}
---
${email.bodyPreview}`;
}

/**
 * Ingest Gmail messages into unified thread
 */
export async function ingestGmailMessages(
  tenantId: string,
  emails: GmailMessage[],
  userEmail: string,
): Promise<EmailIngestionResult> {
  const result: EmailIngestionResult = { ingested: 0, skipped: 0, errors: 0 };

  for (const email of emails) {
    try {
      // Check if already ingested
      if (await isEmailAlreadyIngested(tenantId, email.id)) {
        result.skipped++;
        continue;
      }

      // Determine direction
      const senderEmail = extractEmail(email.from);
      const direction =
        senderEmail.toLowerCase() === userEmail.toLowerCase()
          ? "outbound"
          : "inbound";

      // Role based on direction
      const role = direction === "outbound" ? "assistant" : "user";

      // Format content
      const content = formatGmailContent(email);

      // Parse created_at from email date
      let createdAt: string | undefined;
      try {
        createdAt = new Date(email.date).toISOString();
      } catch {
        createdAt = undefined;
      }

      await appendMessage(tenantId, {
        role,
        content,
        channel: "email",
        direction,
        source_type: "email_import",
        source_id: email.id,
        metadata: {
          from: email.from,
          to: email.to,
          subject: email.subject,
          threadId: email.threadId,
          labelIds: email.labelIds,
          date: email.date,
          isUnread: email.labelIds?.includes("UNREAD"),
          originalCreatedAt: createdAt,
        },
      });

      result.ingested++;
    } catch (error) {
      logger.error("[EmailIngest] Failed to ingest Gmail:", email.id, error);
      result.errors++;
    }
  }

  return result;
}

/**
 * Ingest Outlook messages into unified thread
 */
export async function ingestOutlookMessages(
  tenantId: string,
  emails: OutlookMessage[],
  userEmail: string,
): Promise<EmailIngestionResult> {
  const result: EmailIngestionResult = { ingested: 0, skipped: 0, errors: 0 };

  for (const email of emails) {
    try {
      // Check if already ingested
      if (await isEmailAlreadyIngested(tenantId, email.id)) {
        result.skipped++;
        continue;
      }

      // Determine direction
      const senderEmail = email.from.emailAddress.address;
      const direction =
        senderEmail.toLowerCase() === userEmail.toLowerCase()
          ? "outbound"
          : "inbound";

      // Role based on direction
      const role = direction === "outbound" ? "assistant" : "user";

      // Format content
      const content = formatOutlookContent(email);

      // Parse created_at
      let createdAt: string | undefined;
      try {
        createdAt = new Date(email.receivedDateTime).toISOString();
      } catch {
        createdAt = undefined;
      }

      await appendMessage(tenantId, {
        role,
        content,
        channel: "email",
        direction,
        source_type: "email_import",
        source_id: email.id,
        metadata: {
          from: `${email.from.emailAddress.name} <${email.from.emailAddress.address}>`,
          to: email.toRecipients
            .map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`)
            .join(", "),
          subject: email.subject,
          date: email.receivedDateTime,
          isUnread: !email.isRead,
          importance: email.importance,
          originalCreatedAt: createdAt,
        },
      });

      result.ingested++;
    } catch (error) {
      logger.error("[EmailIngest] Failed to ingest Outlook:", email.id, error);
      result.errors++;
    }
  }

  return result;
}
