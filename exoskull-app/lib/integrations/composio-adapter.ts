/**
 * Composio Adapter -- SDK wrapper for 400+ SaaS integrations
 *
 * Each ExoSkull tenant_id maps 1:1 to a Composio userId.
 * Composio manages OAuth tokens; we just execute actions.
 *
 * Reliability features:
 * - Connection health check before each action (isConnectionHealthy)
 * - Retry wrapper with 3 attempts + exponential backoff
 * - Auto-reconnect flow if connection is dead
 * - Structured logging [Composio:<operation>:<step>]
 * - Circuit breaker: skip retries after 3 consecutive failures (resets on success)
 *
 * Flow:
 * 1. User says "connect Gmail" -> initiateConnection() -> redirectUrl
 * 2. User clicks link -> completes OAuth on Composio
 * 3. IORS calls executeAction('GMAIL_SEND_EMAIL', { to, subject, body })
 */

import { Composio } from "@composio/core";

import { logger } from "@/lib/logger";
import { recordIntegrationCall } from "@/lib/system/health-checker";

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

// ============================================================================
// RETRY WRAPPER -- 3 attempts, exponential backoff
// ============================================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500; // 500ms, 1000ms, 2000ms

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`[Composio:${label}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        `[Composio:${label}] Attempt ${attempt}/${MAX_RETRIES} failed:`,
        {
          error: lastError.message,
        },
      );

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw (
    lastError ||
    new Error(`[Composio:${label}] Failed after ${MAX_RETRIES} retries`)
  );
}

// ============================================================================
// CONNECTION HEALTH TRACKING
// ============================================================================

interface ConnectionHealth {
  consecutiveFailures: number;
  lastCheckedAt: number;
  lastSuccessAt: number;
}

// In-memory health tracker (per-tenant per-toolkit)
const healthMap = new Map<string, ConnectionHealth>();

function getHealthKey(tenantId: string, toolkit: string): string {
  return `${tenantId}:${toolkit.toUpperCase()}`;
}

function recordSuccess(tenantId: string, toolkit: string): void {
  const key = getHealthKey(tenantId, toolkit);
  healthMap.set(key, {
    consecutiveFailures: 0,
    lastCheckedAt: Date.now(),
    lastSuccessAt: Date.now(),
  });
}

function recordFailure(tenantId: string, toolkit: string): void {
  const key = getHealthKey(tenantId, toolkit);
  const current = healthMap.get(key) || {
    consecutiveFailures: 0,
    lastCheckedAt: 0,
    lastSuccessAt: 0,
  };
  healthMap.set(key, {
    ...current,
    consecutiveFailures: current.consecutiveFailures + 1,
    lastCheckedAt: Date.now(),
  });
}

function getHealth(
  tenantId: string,
  toolkit: string,
): ConnectionHealth | undefined {
  return healthMap.get(getHealthKey(tenantId, toolkit));
}

/** Popular toolkits available to users */
export const COMPOSIO_TOOLKITS = [
  { slug: "GMAIL", name: "Gmail", description: "Email (wysylanie, czytanie)" },
  {
    slug: "GOOGLECALENDAR",
    name: "Google Calendar",
    description: "Kalendarz (tworzenie eventow, sprawdzanie dostepnosci)",
  },
  {
    slug: "NOTION",
    name: "Notion",
    description: "Notatki, bazy danych, wiki",
  },
  {
    slug: "TODOIST",
    name: "Todoist",
    description: "Zarzadzanie zadaniami",
  },
  {
    slug: "SLACK",
    name: "Slack",
    description: "Komunikacja zespolowa",
  },
  {
    slug: "GITHUB",
    name: "GitHub",
    description: "Repozytoria, issues, PR-y",
  },
  {
    slug: "GOOGLEDRIVE",
    name: "Google Drive",
    description: "Pliki, dokumenty, udostepnianie",
  },
  {
    slug: "OUTLOOK",
    name: "Outlook",
    description: "Email Microsoft (wysylanie, czytanie)",
  },
  {
    slug: "TRELLO",
    name: "Trello",
    description: "Tablice kanban, karty",
  },
  {
    slug: "LINEAR",
    name: "Linear",
    description: "Zarzadzanie projektami (dev)",
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

  logger.info("[Composio:initiateConnection:start]", { tenantId, toolkit });

  const connRequest = await withRetry("initiateConnection", () =>
    client.connectedAccounts.initiate(tenantId, toolkit, { callbackUrl }),
  );

  logger.info("[Composio:initiateConnection:success]", {
    tenantId,
    toolkit,
    hasRedirect: !!connRequest.redirectUrl,
  });

  return {
    redirectUrl: connRequest.redirectUrl ?? "",
    connectionId: connRequest.id ?? "",
  };
}

/**
 * List active connections for a tenant.
 * Cached for 5 minutes per tenant (external API call, 100-300ms uncached).
 */

const connectionsCache = new Map<
  string,
  {
    data: Array<{
      id: string;
      toolkit: string;
      status: string;
      createdAt: string;
    }>;
    ts: number;
  }
>();
const CONNECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CONNECTIONS_TIMEOUT_MS = 500; // 500ms timeout (was unbounded)

export async function listConnections(
  tenantId: string,
): Promise<
  Array<{ id: string; toolkit: string; status: string; createdAt: string }>
> {
  // Cache hit
  const cached = connectionsCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CONNECTIONS_CACHE_TTL) {
    return cached.data;
  }

  try {
    const client = getClient();

    // Race with timeout — don't let Composio block context loading
    const response = await Promise.race([
      withRetry("listConnections", () =>
        client.connectedAccounts.list({
          userIds: [tenantId],
          statuses: ["ACTIVE"],
        }),
      ),
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error("Composio timeout")),
          CONNECTIONS_TIMEOUT_MS,
        ),
      ),
    ]);

    const items = response?.items ?? [];

    const result = items.map((conn) => ({
      id: conn.id || "",
      toolkit: (conn as unknown as Record<string, string>).toolkitSlug || "",
      status: conn.status || "unknown",
      createdAt: conn.createdAt || "",
    }));

    // Cache successful result
    connectionsCache.set(tenantId, { data: result, ts: Date.now() });
    return result;
  } catch {
    // On timeout/error, return stale cache if available, else empty
    if (cached) return cached.data;
    return [];
  }
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
    logger.error("[Composio:hasConnection:failed]", {
      tenantId,
      toolkit,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}

/**
 * Pre-flight health check: Verify connection is active before executing action.
 * Returns { ok: true } or { ok: false, reason, needsReconnect }.
 */
export async function checkConnectionHealth(
  tenantId: string,
  toolkit: string,
): Promise<{ ok: boolean; reason?: string; needsReconnect?: boolean }> {
  const health = getHealth(tenantId, toolkit);

  // Circuit breaker: If 3+ consecutive failures in last 5 minutes, skip
  if (
    health &&
    health.consecutiveFailures >= 3 &&
    Date.now() - health.lastCheckedAt < 5 * 60_000
  ) {
    logger.warn("[Composio:healthCheck:circuitOpen]", {
      tenantId,
      toolkit,
      consecutiveFailures: health.consecutiveFailures,
    });
    return {
      ok: false,
      reason: `Polaczenie z ${toolkit} niestabilne (${health.consecutiveFailures} bledow z rzedu). Sprobuj ponownie za kilka minut lub polacz ponownie.`,
      needsReconnect: true,
    };
  }

  try {
    const connected = await hasConnection(tenantId, toolkit);
    if (!connected) {
      return {
        ok: false,
        reason: `Brak aktywnego polaczenia z ${toolkit}. Uzyj composio_connect zeby polaczyc.`,
        needsReconnect: true,
      };
    }
    return { ok: true };
  } catch (err) {
    logger.warn("[Composio:healthCheck:error]", {
      tenantId,
      toolkit,
      error: err instanceof Error ? err.message : err,
    });
    return {
      ok: false,
      reason: `Nie mozna zweryfikowac polaczenia z ${toolkit}: ${err instanceof Error ? err.message : "nieznany blad"}`,
      needsReconnect: false,
    };
  }
}

/**
 * Execute a Composio tool/action with pre-flight health check + retry.
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
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
  needsReconnect?: boolean;
}> {
  const client = getClient();
  const toolkit = toolSlug.split("_")[0];
  const actionStart = Date.now();

  logger.info("[Composio:executeAction:start]", {
    toolSlug,
    tenantId,
    toolkit,
    argKeys: Object.keys(args),
  });

  // Pre-flight: ensure connection is active (with circuit breaker probe)
  const health = await checkConnectionHealth(tenantId, toolkit);
  if (!health.ok) {
    // Probe: try re-checking in case circuit recovered
    if (health.needsReconnect) {
      try {
        const probe = await hasConnection(tenantId, toolkit);
        if (probe) {
          recordSuccess(tenantId, toolkit);
          logger.info("[Composio:executeAction:circuitRecovered]", {
            toolSlug,
            tenantId,
          });
          // Fall through to execute
        } else {
          recordIntegrationCall(
            tenantId,
            toolkit,
            toolSlug,
            false,
            Date.now() - actionStart,
            health.reason,
          );
          return { success: false, error: health.reason, needsReconnect: true };
        }
      } catch {
        recordIntegrationCall(
          tenantId,
          toolkit,
          toolSlug,
          false,
          Date.now() - actionStart,
          health.reason,
        );
        return { success: false, error: health.reason, needsReconnect: true };
      }
    } else {
      recordIntegrationCall(
        tenantId,
        toolkit,
        toolSlug,
        false,
        Date.now() - actionStart,
        health.reason,
      );
      return {
        success: false,
        error: health.reason,
        needsReconnect: health.needsReconnect,
      };
    }
  }

  try {
    const result = await withRetry(`executeAction:${toolSlug}`, () =>
      client.tools.execute(toolSlug, {
        userId: tenantId,
        arguments: args,
      }),
    );

    const dur = Date.now() - actionStart;
    recordSuccess(tenantId, toolkit);
    recordIntegrationCall(tenantId, toolkit, toolSlug, true, dur);
    logger.info("[Composio:executeAction:success]", {
      toolSlug,
      tenantId,
      durationMs: dur,
    });

    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is401 =
      msg.includes("401") ||
      msg.includes("Unauthorized") ||
      msg.includes("expired");

    // Auto-retry on 401 (token expiry)
    if (is401) {
      logger.warn("[Composio:executeAction:401Retry]", { toolSlug, tenantId });
      try {
        const recheck = await hasConnection(tenantId, toolkit);
        if (recheck) {
          const retryResult = await client.tools.execute(toolSlug, {
            userId: tenantId,
            arguments: args,
          });
          const dur = Date.now() - actionStart;
          recordSuccess(tenantId, toolkit);
          recordIntegrationCall(tenantId, toolkit, toolSlug, true, dur);
          return { success: true, data: retryResult };
        }
      } catch (retryErr) {
        logger.warn("[Composio:executeAction:401RetryFailed]", {
          error: retryErr,
        });
      }
    }

    recordFailure(tenantId, toolkit);
    const dur = Date.now() - actionStart;
    recordIntegrationCall(tenantId, toolkit, toolSlug, false, dur, msg);

    const currentHealth = getHealth(tenantId, toolkit);
    const needsReconnect =
      (currentHealth?.consecutiveFailures ?? 0) >= 3 || is401;

    logger.error("[Composio:executeAction:failed]", {
      toolSlug,
      tenantId,
      error: msg,
      consecutiveFailures: currentHealth?.consecutiveFailures ?? 0,
      needsReconnect,
    });

    return {
      success: false,
      error: msg,
      needsReconnect,
    };
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
    await withRetry("disconnectAccount", () =>
      client.connectedAccounts.delete(connectionId),
    );
    return true;
  } catch (err) {
    logger.error("[Composio:disconnectAccount:failed]", {
      connectionId,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}

/**
 * Get health status for all connected integrations (for dashboard widget).
 */
export function getConnectionHealthSummary(tenantId: string): Array<{
  toolkit: string;
  consecutiveFailures: number;
  lastSuccessAt: number;
  isHealthy: boolean;
}> {
  const results: Array<{
    toolkit: string;
    consecutiveFailures: number;
    lastSuccessAt: number;
    isHealthy: boolean;
  }> = [];

  for (const tk of COMPOSIO_TOOLKITS) {
    const health = getHealth(tenantId, tk.slug);
    if (health) {
      results.push({
        toolkit: tk.slug,
        consecutiveFailures: health.consecutiveFailures,
        lastSuccessAt: health.lastSuccessAt,
        isHealthy: health.consecutiveFailures < 3,
      });
    }
  }

  return results;
}
