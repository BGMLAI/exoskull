/**
 * Integration Health Monitor
 * Phase 1: Foundation & Quick Wins
 *
 * Monitors health of all integrations (Gmail, Outlook, Twilio, Google Fit, etc.)
 * - Periodic health checks (every 5min via CRON)
 * - Circuit breaker pattern (auto-disable after 3 failures)
 * - Proactive alerts to user when integration degrades/fails
 * - Forensics logging for debugging
 */

import { createClient } from "@/lib/supabase/server";

export type IntegrationType =
  | "gmail"
  | "outlook"
  | "twilio"
  | "google_fit"
  | "google_drive"
  | "oura"
  | "whoop"
  | "fitbit"
  | "apple_health"
  | "slack"
  | "telegram"
  | "discord";

export type HealthStatus = "healthy" | "degraded" | "down";
export type CircuitState = "closed" | "open" | "half_open";

export interface IntegrationHealth {
  tenant_id: string;
  integration_type: IntegrationType;
  status: HealthStatus;
  last_check_at: Date;
  last_success_at: Date | null;
  consecutive_failures: number;
  error_count_24h: number;
  circuit_state: CircuitState;
  circuit_opened_at: Date | null;
  last_error_message: string | null;
  last_error_code: string | null;
}

export interface IntegrationEvent {
  integration_type: IntegrationType;
  event_type:
    | "health_check"
    | "auth_refresh"
    | "api_call"
    | "auto_disable"
    | "auto_enable"
    | "circuit_open"
    | "circuit_close"
    | "circuit_half_open"
    | "manual_test";
  success: boolean;
  duration_ms?: number;
  error_message?: string;
  error_code?: string;
  details?: Record<string, any>;
}

/**
 * Record integration health check result
 */
export async function recordHealthCheck(
  tenantId: string,
  integrationType: IntegrationType,
  success: boolean,
  error?: { message: string; code?: string },
): Promise<void> {
  try {
    const supabase = await createClient();

    const { error: rpcError } = await supabase.rpc(
      "update_integration_health",
      {
        p_tenant_id: tenantId,
        p_integration_type: integrationType,
        p_success: success,
        p_error_message: error?.message || null,
        p_error_code: error?.code || null,
      },
    );

    if (rpcError) {
      console.error("[IntegrationHealth] Failed to record health check:", {
        tenantId,
        integrationType,
        error: rpcError.message,
      });
    }
  } catch (error) {
    console.error("[IntegrationHealth] recordHealthCheck error:", {
      tenantId,
      integrationType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Log integration event (for forensics)
 */
export async function logIntegrationEvent(
  tenantId: string,
  event: IntegrationEvent,
): Promise<void> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("exo_integration_events").insert({
      tenant_id: tenantId,
      integration_type: event.integration_type,
      event_type: event.event_type,
      success: event.success,
      duration_ms: event.duration_ms,
      error_message: event.error_message,
      error_code: event.error_code,
      details: event.details || {},
    });

    if (error) {
      console.error("[IntegrationHealth] Failed to log event:", {
        tenantId,
        event: event.event_type,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("[IntegrationHealth] logIntegrationEvent error:", {
      tenantId,
      event: event.event_type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get health summary for all integrations of a tenant
 */
export async function getIntegrationHealthSummary(
  tenantId: string,
): Promise<IntegrationHealth[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "get_integration_health_summary",
      {
        p_tenant_id: tenantId,
      },
    );

    if (error) {
      console.error("[IntegrationHealth] Failed to get health summary:", {
        tenantId,
        error: error.message,
      });
      return [];
    }

    return (data || []) as IntegrationHealth[];
  } catch (error) {
    console.error("[IntegrationHealth] getIntegrationHealthSummary error:", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get recent events for an integration (debugging)
 */
export async function getRecentIntegrationEvents(
  tenantId: string,
  integrationType?: IntegrationType,
  limit: number = 20,
): Promise<IntegrationEvent[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "get_recent_integration_events",
      {
        p_tenant_id: tenantId,
        p_integration_type: integrationType || null,
        p_limit: limit,
      },
    );

    if (error) {
      console.error("[IntegrationHealth] Failed to get recent events:", {
        tenantId,
        integrationType,
        error: error.message,
      });
      return [];
    }

    return (data || []) as IntegrationEvent[];
  } catch (error) {
    console.error("[IntegrationHealth] getRecentIntegrationEvents error:", {
      tenantId,
      integrationType,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Check if integration is healthy (circuit closed)
 */
export async function isIntegrationHealthy(
  tenantId: string,
  integrationType: IntegrationType,
): Promise<boolean> {
  try {
    const summary = await getIntegrationHealthSummary(tenantId);
    const health = summary.find((h) => h.integration_type === integrationType);

    if (!health) {
      // No health record = assume healthy (integration not yet checked)
      return true;
    }

    // Healthy if circuit closed and status is healthy/degraded (not down)
    return health.circuit_state === "closed" && health.status !== "down";
  } catch (error) {
    console.error("[IntegrationHealth] isIntegrationHealthy error:", {
      tenantId,
      integrationType,
      error: error instanceof Error ? error.message : String(error),
    });
    // Default to healthy on error (fail-open)
    return true;
  }
}

/**
 * Integration-specific health checkers
 */

export async function checkGmailHealth(
  tenantId: string,
  accessToken: string,
): Promise<boolean> {
  const startTime = Date.now();
  try {
    // Simple health check: fetch profile
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const durationMs = Date.now() - startTime;
    const success = response.ok;

    if (!success) {
      const errorData = await response.json().catch(() => ({}));
      await recordHealthCheck(tenantId, "gmail", false, {
        message: errorData.error?.message || "Gmail API error",
        code: String(response.status),
      });
      return false;
    }

    await recordHealthCheck(tenantId, "gmail", true);
    await logIntegrationEvent(tenantId, {
      integration_type: "gmail",
      event_type: "health_check",
      success: true,
      duration_ms: durationMs,
    });

    return true;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await recordHealthCheck(tenantId, "gmail", false, {
      message: errorMessage,
      code: "NETWORK_ERROR",
    });

    await logIntegrationEvent(tenantId, {
      integration_type: "gmail",
      event_type: "health_check",
      success: false,
      duration_ms: durationMs,
      error_message: errorMessage,
      error_code: "NETWORK_ERROR",
    });

    return false;
  }
}

export async function checkOutlookHealth(
  tenantId: string,
  accessToken: string,
): Promise<boolean> {
  const startTime = Date.now();
  try {
    // Simple health check: fetch profile
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const durationMs = Date.now() - startTime;
    const success = response.ok;

    if (!success) {
      const errorData = await response.json().catch(() => ({}));
      await recordHealthCheck(tenantId, "outlook", false, {
        message: errorData.error?.message || "Outlook API error",
        code: String(response.status),
      });
      return false;
    }

    await recordHealthCheck(tenantId, "outlook", true);
    await logIntegrationEvent(tenantId, {
      integration_type: "outlook",
      event_type: "health_check",
      success: true,
      duration_ms: durationMs,
    });

    return true;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await recordHealthCheck(tenantId, "outlook", false, {
      message: errorMessage,
      code: "NETWORK_ERROR",
    });

    await logIntegrationEvent(tenantId, {
      integration_type: "outlook",
      event_type: "health_check",
      success: false,
      duration_ms: durationMs,
      error_message: errorMessage,
      error_code: "NETWORK_ERROR",
    });

    return false;
  }
}

export async function checkTwilioHealth(tenantId: string): Promise<boolean> {
  const startTime = Date.now();
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error("Twilio credentials not configured");
    }

    // Simple health check: fetch account details
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    const durationMs = Date.now() - startTime;
    const success = response.ok;

    if (!success) {
      const errorData = await response.json().catch(() => ({}));
      await recordHealthCheck(tenantId, "twilio", false, {
        message: errorData.message || "Twilio API error",
        code: String(response.status),
      });
      return false;
    }

    await recordHealthCheck(tenantId, "twilio", true);
    await logIntegrationEvent(tenantId, {
      integration_type: "twilio",
      event_type: "health_check",
      success: true,
      duration_ms: durationMs,
    });

    return true;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await recordHealthCheck(tenantId, "twilio", false, {
      message: errorMessage,
      code: "NETWORK_ERROR",
    });

    await logIntegrationEvent(tenantId, {
      integration_type: "twilio",
      event_type: "health_check",
      success: false,
      duration_ms: durationMs,
      error_message: errorMessage,
      error_code: "NETWORK_ERROR",
    });

    return false;
  }
}

/**
 * Run health checks for all configured integrations
 */
export async function runAllHealthChecks(tenantId: string): Promise<void> {
  try {
    const supabase = await createClient();

    // Get tenant's configured integrations (email accounts, etc.)
    const { data: emailAccounts } = await supabase
      .from("exo_email_accounts")
      .select("provider, access_token")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    // Check email providers
    if (emailAccounts) {
      for (const account of emailAccounts) {
        if (account.provider === "gmail" && account.access_token) {
          await checkGmailHealth(tenantId, account.access_token);
        } else if (account.provider === "outlook" && account.access_token) {
          await checkOutlookHealth(tenantId, account.access_token);
        }
      }
    }

    // Check Twilio (voice/SMS)
    await checkTwilioHealth(tenantId);

    // TODO: Add more integration health checks as needed
    // - Google Fit
    // - Google Drive
    // - Oura
    // - Whoop
    // - Fitbit
    // - Apple Health
    // - Slack
    // - Telegram
    // - Discord
  } catch (error) {
    console.error("[IntegrationHealth] runAllHealthChecks error:", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get degraded/down integrations for proactive alerts
 */
export async function getDegradedIntegrations(
  tenantId: string,
): Promise<IntegrationHealth[]> {
  const summary = await getIntegrationHealthSummary(tenantId);
  return summary.filter((h) => h.status === "degraded" || h.status === "down");
}
