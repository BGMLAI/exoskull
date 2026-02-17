/**
 * Email Sync Module
 *
 * Orchestrates fetching new emails from all connected providers.
 * Called by /api/cron/email-sync every 15 minutes.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getRigConnection } from "@/lib/tools/rig-helpers";
import { logActivity } from "@/lib/activity-log";
import { fetchGmailEmails } from "./providers/gmail";
import { fetchOutlookEmails } from "./providers/outlook";
import type { EmailAccount, RawEmail, SyncResult } from "./types";
import { decryptImapPassword } from "./crypto";

import { logger } from "@/lib/logger";
/**
 * Sync all enabled email accounts for all tenants.
 * Returns array of per-account sync results.
 */
export async function syncAllAccounts(
  timeoutMs = 50_000,
): Promise<SyncResult[]> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // Fetch accounts due for sync
  const { data: accounts, error } = await supabase
    .from("exo_email_accounts")
    .select("*")
    .eq("sync_enabled", true)
    .or(
      "last_sync_at.is.null,last_sync_at.lt." +
        new Date(Date.now() - 5 * 60_000).toISOString(),
    )
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(20);

  if (error || !accounts?.length) {
    return [];
  }

  const results: SyncResult[] = [];

  for (const account of accounts as EmailAccount[]) {
    // Safety timeout
    if (Date.now() - startTime > timeoutMs) break;

    try {
      const result = await syncSingleAccount(account);
      results.push(result);

      // Update sync state
      await supabase
        .from("exo_email_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_message_id:
            result.lastMessageId || account.last_sync_message_id,
          emails_synced: (account.emails_synced || 0) + result.newEmails,
          sync_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      if (result.newEmails > 0) {
        logActivity({
          tenantId: account.tenant_id,
          actionType: "cron_action",
          actionName: "email_sync",
          description: `Zsynchronizowano ${result.newEmails} nowych emaili z ${account.email_address}`,
          source: "email-sync",
          metadata: {
            provider: account.provider,
            newEmails: result.newEmails,
            accountId: account.id,
          },
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("[EmailSync] Account sync failed:", {
        accountId: account.id,
        provider: account.provider,
        error: errMsg,
      });

      await supabase
        .from("exo_email_accounts")
        .update({
          sync_error: errMsg,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      results.push({
        accountId: account.id,
        provider: account.provider,
        newEmails: 0,
        errors: 1,
      });
    }
  }

  return results;
}

/**
 * Sync a single email account
 */
async function syncSingleAccount(account: EmailAccount): Promise<SyncResult> {
  let rawEmails: RawEmail[] = [];

  switch (account.provider) {
    case "gmail": {
      const conn = await getRigConnection(
        account.tenant_id,
        account.rig_connection_id ? "google-workspace" : "google",
      );
      if (!conn?.access_token) {
        throw new Error("Gmail: brak polaczenia OAuth (brak access_token)");
      }
      rawEmails = await fetchGmailEmails(conn.access_token, {
        maxResults: 50,
        sinceMessageId: account.last_sync_message_id || undefined,
      });
      break;
    }

    case "outlook": {
      const conn = await getRigConnection(account.tenant_id, "microsoft-365");
      if (!conn?.access_token) {
        throw new Error("Outlook: brak polaczenia OAuth (brak access_token)");
      }
      rawEmails = await fetchOutlookEmails(conn.access_token, {
        maxResults: 50,
        sinceDateTime: account.last_sync_at || undefined,
      });
      break;
    }

    case "imap": {
      if (
        !account.imap_host ||
        !account.imap_user ||
        !account.imap_password_encrypted
      ) {
        throw new Error("IMAP: brak konfiguracji (host/user/password)");
      }
      const { fetchImapEmails } = await import("./providers/imap");
      const password = decryptImapPassword(account.imap_password_encrypted);
      rawEmails = await fetchImapEmails(
        {
          host: account.imap_host,
          port: account.imap_port || 993,
          user: account.imap_user,
          password,
          secure: account.imap_use_tls,
        },
        {
          maxResults: 50,
          sinceUid: account.last_sync_message_id || undefined,
        },
      );
      break;
    }

    default:
      throw new Error(`Nieznany provider: ${account.provider}`);
  }

  if (rawEmails.length === 0) {
    return {
      accountId: account.id,
      provider: account.provider,
      newEmails: 0,
      errors: 0,
      lastMessageId: account.last_sync_message_id || undefined,
    };
  }

  // Filter outbound if not enabled
  const userEmail = account.email_address.toLowerCase();
  const filteredEmails = account.analyze_sent
    ? rawEmails
    : rawEmails.filter((e) => e.fromEmail.toLowerCase() !== userEmail);

  // Insert into exo_analyzed_emails (with dedup via ON CONFLICT)
  const supabase = getServiceSupabase();
  let inserted = 0;
  let errors = 0;

  for (const email of filteredEmails) {
    const direction =
      email.fromEmail.toLowerCase() === userEmail
        ? "outbound"
        : email.toEmails.some((t) => t.toLowerCase() === userEmail)
          ? "inbound"
          : "self";

    const { error: insertErr } = await supabase
      .from("exo_analyzed_emails")
      .upsert(
        {
          tenant_id: account.tenant_id,
          account_id: account.id,
          provider_message_id: email.messageId,
          thread_id: email.threadId,
          subject: email.subject,
          from_name: email.fromName,
          from_email: email.fromEmail,
          to_emails: email.toEmails,
          cc_emails: email.ccEmails,
          date_received: email.dateReceived,
          snippet: email.snippet,
          body_text: (email.bodyText || "").slice(0, 50_000),
          body_html: (email.bodyHtml || "").slice(0, 100_000),
          has_attachments: email.hasAttachments,
          attachment_names: email.attachmentNames,
          attachment_metadata: email.attachmentMetadata || [],
          direction,
          is_read: email.isRead,
          labels: email.labels || [],
          analysis_status: "pending",
        },
        {
          onConflict: "account_id,provider_message_id",
          ignoreDuplicates: true,
        },
      );

    if (insertErr) {
      errors++;
      logger.error("[EmailSync] Insert error:", {
        messageId: email.messageId,
        error: insertErr.message,
      });
    } else {
      inserted++;
    }
  }

  // Track latest message ID for cursor
  const lastMessageId =
    rawEmails[0]?.messageId || account.last_sync_message_id || undefined;

  return {
    accountId: account.id,
    provider: account.provider,
    newEmails: inserted,
    errors,
    lastMessageId,
  };
}
