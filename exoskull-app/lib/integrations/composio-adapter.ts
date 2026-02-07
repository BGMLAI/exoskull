/**
 * Composio Adapter — SDK wrapper for 400+ SaaS integrations
 *
 * Each ExoSkull tenant_id maps 1:1 to a Composio userId.
 * Composio manages OAuth tokens; we just execute actions.
 *
 * Flow:
 * 1. User says "connect Gmail" → initiateConnection() → redirectUrl
 * 2. User clicks link → completes OAuth on Composio
 * 3. IORS calls executeAction('GMAIL_SEND_EMAIL', { to, subject, body })
 */

import { Composio } from "@composio/core";

let _client: Composio | null = null;

function getClient(): Composio {
  if (!_client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error("[Composio] COMPOSIO_API_KEY not set");
    }
    _client = new Composio({ apiKey });
  }
  return _client;
}

/** Popular toolkits available to users */
export const COMPOSIO_TOOLKITS = [
  { slug: "GMAIL", name: "Gmail", description: "Email (wysyłanie, czytanie)" },
  {
    slug: "GOOGLECALENDAR",
    name: "Google Calendar",
    description: "Kalendarz (tworzenie eventów, sprawdzanie dostępności)",
  },
  {
    slug: "NOTION",
    name: "Notion",
    description: "Notatki, bazy danych, wiki",
  },
  {
    slug: "TODOIST",
    name: "Todoist",
    description: "Zarządzanie zadaniami",
  },
  {
    slug: "SLACK",
    name: "Slack",
    description: "Komunikacja zespołowa",
  },
  {
    slug: "GITHUB",
    name: "GitHub",
    description: "Repozytoria, issues, PR-y",
  },
  {
    slug: "GOOGLEDRIVE",
    name: "Google Drive",
    description: "Pliki, dokumenty, udostępnianie",
  },
  {
    slug: "OUTLOOK",
    name: "Outlook",
    description: "Email Microsoft (wysyłanie, czytanie)",
  },
  {
    slug: "TRELLO",
    name: "Trello",
    description: "Tablice kanban, karty",
  },
  {
    slug: "LINEAR",
    name: "Linear",
    description: "Zarządzanie projektami (dev)",
  },
] as const;

export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number]["slug"];

/**
 * Initiate OAuth connection for a user.
 * Returns URL that user opens in browser.
 */
export async function initiateConnection(
  tenantId: string,
  toolkit: string,
): Promise<{ redirectUrl: string; connectionId: string }> {
  const client = getClient();
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
  const callbackUrl = `${APP_URL}/api/integrations/composio/callback`;

  console.log("[Composio] Initiating connection:", { tenantId, toolkit });

  const connRequest = await client.connectedAccounts.initiate(
    tenantId,
    toolkit,
    { callbackUrl },
  );

  return {
    redirectUrl: connRequest.redirectUrl ?? "",
    connectionId: connRequest.id ?? "",
  };
}

/**
 * List active connections for a tenant.
 */
export async function listConnections(
  tenantId: string,
): Promise<
  Array<{ id: string; toolkit: string; status: string; createdAt: string }>
> {
  const client = getClient();

  const response = await client.connectedAccounts.list({
    userIds: [tenantId],
    statuses: ["ACTIVE"],
  });

  const items = response?.items ?? [];

  return items.map((conn) => ({
    id: conn.id || "",
    toolkit: (conn as unknown as Record<string, string>).toolkitSlug || "",
    status: conn.status || "unknown",
    createdAt: conn.createdAt || "",
  }));
}

/**
 * Check if a tenant has an active connection for a specific toolkit.
 */
export async function hasConnection(
  tenantId: string,
  toolkit: string,
): Promise<boolean> {
  try {
    const connections = await listConnections(tenantId);
    return connections.some(
      (c) => c.toolkit.toUpperCase() === toolkit.toUpperCase(),
    );
  } catch (err) {
    console.error("[Composio] hasConnection error:", {
      tenantId,
      toolkit,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}

/**
 * Execute a Composio tool/action.
 *
 * @example
 * await executeAction('GMAIL_SEND_EMAIL', tenantId, {
 *   to: 'bob@example.com',
 *   subject: 'Hello',
 *   body: 'Hi from ExoSkull!',
 * });
 */
export async function executeAction(
  toolSlug: string,
  tenantId: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const client = getClient();

  console.log("[Composio] Executing action:", {
    toolSlug,
    tenantId,
    argKeys: Object.keys(args),
  });

  try {
    const result = await client.tools.execute(toolSlug, {
      userId: tenantId,
      arguments: args,
    });

    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Composio] executeAction failed:", {
      toolSlug,
      tenantId,
      error: msg,
    });
    return { success: false, error: msg };
  }
}

/**
 * Disconnect a connected account.
 */
export async function disconnectAccount(
  connectionId: string,
): Promise<boolean> {
  const client = getClient();
  try {
    await client.connectedAccounts.delete(connectionId);
    return true;
  } catch (err) {
    console.error("[Composio] disconnect error:", {
      connectionId,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}
