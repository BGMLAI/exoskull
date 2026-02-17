/**
 * Gmail Provider — Full-body email fetching via Gmail API
 *
 * Extends existing GoogleWorkspaceClient with full message body support.
 * Uses format=full for complete MIME parsing.
 */

import type { RawEmail, AttachmentMeta } from "../types";

import { logger } from "@/lib/logger";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Fetch recent Gmail messages with full body text.
 */
export async function fetchGmailEmails(
  accessToken: string,
  options: {
    maxResults?: number;
    sinceMessageId?: string;
    query?: string;
  } = {},
): Promise<RawEmail[]> {
  const { maxResults = 50, sinceMessageId, query } = options;

  // Build query string
  let q = query || "";
  if (sinceMessageId) {
    // Gmail doesn't support "after messageId" directly,
    // so we use the message to get its date and filter from there
    try {
      const refMsg = await gmailFetch<{ internalDate: string }>(
        accessToken,
        `${GMAIL_API}/messages/${sinceMessageId}?format=minimal`,
      );
      const afterDate = new Date(parseInt(refMsg.internalDate));
      // Use epoch seconds for precision (day-level dates skip same-day emails)
      const afterEpoch = Math.floor(afterDate.getTime() / 1000);
      q = `after:${afterEpoch} ${q}`.trim();
    } catch (err) {
      logger.error("[GmailProvider] Failed to resolve sinceMessageId:", err);
    }
  }

  // List message IDs
  const listUrl = new URL(`${GMAIL_API}/messages`);
  listUrl.searchParams.set("maxResults", String(maxResults));
  listUrl.searchParams.set("labelIds", "INBOX");
  if (q) listUrl.searchParams.set("q", q);

  const listResponse = await gmailFetch<{
    messages?: { id: string }[];
    nextPageToken?: string;
  }>(accessToken, listUrl.toString());

  if (!listResponse.messages?.length) return [];

  // Fetch full messages in parallel (batches of 10 to respect rate limits)
  const emails: RawEmail[] = [];
  const messageIds = listResponse.messages.map((m) => m.id);

  // Skip messages we've already seen
  const newIds = sinceMessageId
    ? messageIds.filter((id) => id !== sinceMessageId)
    : messageIds;

  for (let i = 0; i < newIds.length; i += 10) {
    const batch = newIds.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((id) => fetchFullGmailMessage(accessToken, id)),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        emails.push(result.value);
      }
    }
  }

  return emails;
}

/**
 * Fetch a single Gmail message with full body
 */
async function fetchFullGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<RawEmail> {
  const msg = await gmailFetch<GmailFullMessage>(
    accessToken,
    `${GMAIL_API}/messages/${messageId}?format=full`,
  );

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string): string =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    "";

  // Extract body from MIME parts
  const { text, html } = extractBody(msg.payload);

  // Parse from field
  const fromRaw = getHeader("From");
  const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const fromName = fromMatch ? fromMatch[1].replace(/"/g, "").trim() : "";
  const fromEmail = fromMatch ? fromMatch[2] : fromRaw;

  // Parse to/cc
  const toEmails = parseAddressList(getHeader("To"));
  const ccEmails = parseAddressList(getHeader("Cc"));

  // Check for attachments
  const attachmentNames = extractAttachmentNames(msg.payload);
  const attachmentMetadata = extractAttachmentMetadata(msg.payload);

  return {
    messageId: msg.id,
    threadId: msg.threadId,
    subject: getHeader("Subject"),
    fromName,
    fromEmail,
    toEmails,
    ccEmails,
    dateReceived: new Date(parseInt(msg.internalDate)).toISOString(),
    snippet: msg.snippet,
    bodyText: text,
    bodyHtml: html,
    isRead: !msg.labelIds?.includes("UNREAD"),
    hasAttachments: attachmentNames.length > 0,
    attachmentNames,
    attachmentMetadata,
    labels: msg.labelIds || [],
  };
}

// ============================================================================
// MIME parsing helpers
// ============================================================================

interface GmailPart {
  mimeType: string;
  filename?: string;
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailFullMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  internalDate: string;
  payload: GmailPart & {
    headers: { name: string; value: string }[];
  };
}

function extractBody(payload: GmailPart): { text: string; html: string } {
  let text = "";
  let html = "";

  function walk(part: GmailPart): void {
    if (part.mimeType === "text/plain" && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    }
    if (part.mimeType === "text/html" && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);

  // If only HTML available, strip tags for text version
  if (!text && html) {
    text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return { text, html };
}

function extractAttachmentNames(payload: GmailPart): string[] {
  const names: string[] = [];
  function walk(part: GmailPart): void {
    if (part.filename && part.body?.attachmentId) {
      names.push(part.filename);
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }
  walk(payload);
  return names;
}

function extractAttachmentMetadata(payload: GmailPart): AttachmentMeta[] {
  const metas: AttachmentMeta[] = [];
  function walk(part: GmailPart): void {
    if (part.filename && part.body?.attachmentId) {
      metas.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }
  walk(payload);
  return metas;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function parseAddressList(header: string): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((addr) => {
      const match = addr.match(/<(.+?)>/);
      return (match ? match[1] : addr).trim();
    })
    .filter(Boolean);
}

// ============================================================================
// API helper
// ============================================================================

async function gmailFetch<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gmail API ${response.status}: ${errText}`);
  }
  return response.json();
}
