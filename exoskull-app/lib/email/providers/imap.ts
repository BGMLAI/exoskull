/**
 * IMAP Provider — Universal email fetching via IMAP protocol
 *
 * Uses imapflow for modern, Promise-based IMAP access.
 * Supports any email provider: ProtonMail Bridge, corporate mail, etc.
 */

import type { RawEmail } from "../types";

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

/**
 * Fetch recent emails via IMAP
 */
export async function fetchImapEmails(
  config: ImapConfig,
  options: {
    maxResults?: number;
    sinceUid?: string;
    folder?: string;
  } = {},
): Promise<RawEmail[]> {
  const { maxResults = 50, sinceUid, folder = "INBOX" } = options;

  // Dynamic import — imapflow is optional peer dep
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImapFlow } = require("imapflow");

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });

  const emails: RawEmail[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock(folder);

    try {
      // Build search range
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const searchCriteria: Record<string, any> = {};
      if (sinceUid) {
        searchCriteria.uid = `${parseInt(sinceUid) + 1}:*`;
      } else {
        const total = client.mailbox.exists;
        searchCriteria.seq = `${Math.max(1, total - maxResults + 1)}:*`;
      }

      const messageIter = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
        flags: true,
      });

      let count = 0;
      for await (const msg of messageIter) {
        if (count >= maxResults) break;

        const envelope = msg.envelope;
        if (!envelope) continue;

        // Parse body from raw source
        let bodyText = "";
        if (msg.source) {
          bodyText = extractTextFromRaw(msg.source.toString("utf-8"));
        }

        const fromAddr = envelope.from?.[0];
        const toAddrs = envelope.to || [];
        const ccAddrs = envelope.cc || [];

        emails.push({
          messageId: String(msg.uid),
          threadId: envelope.messageId || undefined,
          subject: envelope.subject || "",
          fromName: fromAddr?.name || "",
          fromEmail: fromAddr?.address || "",
          toEmails: toAddrs
            .map((a: { address?: string }) => a.address || "")
            .filter(Boolean),
          ccEmails: ccAddrs
            .map((a: { address?: string }) => a.address || "")
            .filter(Boolean),
          dateReceived: envelope.date
            ? new Date(envelope.date).toISOString()
            : new Date().toISOString(),
          snippet: bodyText.slice(0, 200),
          bodyText,
          isRead: msg.flags?.has("\\Seen") || false,
          hasAttachments: hasAttachmentParts(msg.bodyStructure),
          attachmentNames: extractImapAttachmentNames(msg.bodyStructure),
          labels: Array.from(msg.flags || []),
        });

        count++;
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* ignore cleanup errors */
    }
    throw error;
  }

  return emails;
}

// ============================================================================
// Helpers
// ============================================================================

function extractTextFromRaw(rawEmail: string): string {
  const boundary = rawEmail.match(/boundary="?([^"\r\n]+)"?/i)?.[1];

  if (boundary) {
    const parts = rawEmail.split(`--${boundary}`);
    for (const part of parts) {
      if (part.includes("Content-Type: text/plain")) {
        const bodyStart = part.indexOf("\r\n\r\n");
        if (bodyStart !== -1) {
          let body = part.slice(bodyStart + 4).trim();
          if (part.includes("Content-Transfer-Encoding: base64")) {
            try {
              body = Buffer.from(body.replace(/\s/g, ""), "base64").toString(
                "utf-8",
              );
            } catch {
              /* use raw */
            }
          }
          if (part.includes("Content-Transfer-Encoding: quoted-printable")) {
            body = body
              .replace(/=\r?\n/g, "")
              .replace(/=([0-9A-F]{2})/gi, (_, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              );
          }
          return body;
        }
      }
    }
  }

  // Single-part fallback
  const headerEnd = rawEmail.indexOf("\r\n\r\n");
  if (headerEnd !== -1) {
    return rawEmail
      .slice(headerEnd + 4)
      .trim()
      .slice(0, 5000);
  }

  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAttachmentParts(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) {
    return structure.childNodes.some(hasAttachmentParts);
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImapAttachmentNames(structure: any): string[] {
  const names: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any): void {
    if (!node) return;
    if (node.disposition === "attachment" && node.dispositionParameters) {
      const params = node.dispositionParameters as Record<string, string>;
      if (params.filename) names.push(params.filename);
    }
    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) walk(child);
    }
  }
  walk(structure);
  return names;
}
