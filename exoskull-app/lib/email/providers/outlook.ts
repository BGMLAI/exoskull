/**
 * Outlook Provider — Full-body email fetching via Microsoft Graph API
 */

import type { RawEmail } from "../types";

const GRAPH_API = "https://graph.microsoft.com/v1.0/me";

/**
 * Fetch recent Outlook messages with full body text.
 */
export async function fetchOutlookEmails(
  accessToken: string,
  options: {
    maxResults?: number;
    sinceDateTime?: string;
  } = {},
): Promise<RawEmail[]> {
  const { maxResults = 50, sinceDateTime } = options;

  let url = `${GRAPH_API}/messages?$top=${maxResults}&$orderby=receivedDateTime desc`;
  url += `&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,isRead,hasAttachments,importance`;

  if (sinceDateTime) {
    url += `&$filter=receivedDateTime ge ${sinceDateTime}`;
  }

  const response = await graphFetch<{
    value: OutlookMessage[];
    "@odata.nextLink"?: string;
  }>(accessToken, url);

  if (!response.value?.length) return [];

  // Fetch attachment names for messages that have attachments
  const emails: RawEmail[] = [];

  for (const msg of response.value) {
    let attachmentNames: string[] = [];
    if (msg.hasAttachments) {
      try {
        const attachResp = await graphFetch<{
          value: { name: string }[];
        }>(
          accessToken,
          `${GRAPH_API}/messages/${msg.id}/attachments?$select=name`,
        );
        attachmentNames = attachResp.value.map((a) => a.name);
      } catch {
        // Non-critical, continue without attachment names
      }
    }

    const fromEmail = msg.from?.emailAddress?.address || "";
    const fromName = msg.from?.emailAddress?.name || "";

    emails.push({
      messageId: msg.id,
      threadId: msg.conversationId,
      subject: msg.subject || "",
      fromName,
      fromEmail,
      toEmails: (msg.toRecipients || []).map((r) => r.emailAddress.address),
      ccEmails: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
      dateReceived: msg.receivedDateTime,
      snippet: msg.bodyPreview || "",
      bodyText:
        msg.body?.contentType === "text"
          ? msg.body.content
          : stripHtml(msg.body?.content || ""),
      bodyHtml: msg.body?.contentType === "html" ? msg.body.content : undefined,
      isRead: msg.isRead,
      hasAttachments: msg.hasAttachments,
      attachmentNames,
      labels: msg.importance === "high" ? ["IMPORTANT"] : [],
    });
  }

  return emails;
}

// ============================================================================
// Types
// ============================================================================

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: {
    emailAddress: { name: string; address: string };
  };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  ccRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  bodyPreview: string;
  body: { contentType: "text" | "html"; content: string };
  isRead: boolean;
  hasAttachments: boolean;
  importance: "low" | "normal" | "high";
}

// ============================================================================
// Helpers
// ============================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function graphFetch<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Graph API ${response.status}: ${errText}`);
  }
  return response.json();
}
