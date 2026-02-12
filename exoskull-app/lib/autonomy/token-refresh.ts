/**
 * Proactive OAuth Token Refresh
 * Phase 1: Foundation & Quick Wins
 *
 * Refreshes OAuth tokens BEFORE they expire (5min buffer)
 * - Prevents integration failures from expired tokens
 * - Logs all refresh attempts for debugging
 * - Alerts user if refresh fails (needs reauthorization)
 */

import { createClient } from "@/lib/supabase/server";
import { logIntegrationEvent } from "@/lib/autonomy/integration-health";
import { dispatchReport } from "@/lib/reports/report-dispatcher";

export interface TokenRefreshResult {
  success: boolean;
  provider: "gmail" | "outlook";
  accountId: string;
  newAccessToken?: string;
  newExpiresAt?: Date;
  error?: string;
}

/**
 * Refresh Gmail OAuth token using refresh_token
 */
async function refreshGmailToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[TokenRefresh] Gmail token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error("[TokenRefresh] Gmail token refresh error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Refresh Outlook OAuth token using refresh_token
 */
async function refreshOutlookToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID || "",
          client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/.default offline_access",
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[TokenRefresh] Outlook token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error("[TokenRefresh] Outlook token refresh error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Refresh OAuth token for a specific email account
 */
export async function refreshAccountToken(
  accountId: string,
  provider: "gmail" | "outlook",
  refreshToken: string,
  tenantId: string,
): Promise<TokenRefreshResult> {
  const startTime = Date.now();

  try {
    // Refresh token via provider API
    let result: { access_token: string; expires_in: number } | null = null;

    if (provider === "gmail") {
      result = await refreshGmailToken(refreshToken);
    } else if (provider === "outlook") {
      result = await refreshOutlookToken(refreshToken);
    }

    const durationMs = Date.now() - startTime;

    if (!result) {
      // Refresh failed - log and alert user
      await logIntegrationEvent(tenantId, {
        integration_type: provider,
        event_type: "auth_refresh",
        success: false,
        duration_ms: durationMs,
        error_message: "Token refresh failed - needs reauthorization",
        error_code: "REFRESH_FAILED",
      });

      // Alert user to reauthorize
      const providerName = provider === "gmail" ? "Gmail" : "Outlook";
      const message = `🔐 ${providerName} Reauthorization Needed\n\nYour ${providerName} integration needs to be reauthorized. Please reconnect your account.\n\nGo to: /dashboard/settings/integrations`;
      await dispatchReport(tenantId, message, "insight");

      return {
        success: false,
        provider,
        accountId,
        error: "Token refresh failed",
      };
    }

    // Update database with new token
    const supabase = await createClient();
    const newExpiresAt = new Date(Date.now() + result.expires_in * 1000);

    const { error } = await supabase
      .from("exo_email_accounts")
      .update({
        access_token: result.access_token,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (error) {
      console.error("[TokenRefresh] Failed to update database:", {
        accountId,
        error: error.message,
      });

      await logIntegrationEvent(tenantId, {
        integration_type: provider,
        event_type: "auth_refresh",
        success: false,
        duration_ms: durationMs,
        error_message: `Database update failed: ${error.message}`,
        error_code: "DB_UPDATE_FAILED",
      });

      return {
        success: false,
        provider,
        accountId,
        error: error.message,
      };
    }

    // Success - log event
    await logIntegrationEvent(tenantId, {
      integration_type: provider,
      event_type: "auth_refresh",
      success: true,
      duration_ms: durationMs,
    });

    console.log("[TokenRefresh] Token refreshed successfully:", {
      accountId,
      provider,
      expiresAt: newExpiresAt.toISOString(),
    });

    return {
      success: true,
      provider,
      accountId,
      newAccessToken: result.access_token,
      newExpiresAt,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("[TokenRefresh] Unexpected error:", {
      accountId,
      provider,
      error: errorMessage,
    });

    await logIntegrationEvent(tenantId, {
      integration_type: provider,
      event_type: "auth_refresh",
      success: false,
      duration_ms: durationMs,
      error_message: errorMessage,
      error_code: "UNEXPECTED_ERROR",
    });

    return {
      success: false,
      provider,
      accountId,
      error: errorMessage,
    };
  }
}

/**
 * Check and refresh tokens for all accounts (if expiring soon)
 */
export async function checkAndRefreshExpiring(): Promise<TokenRefreshResult[]> {
  try {
    const supabase = await createClient();

    // Find accounts with tokens expiring in next 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    const { data: accounts, error } = await supabase
      .from("exo_email_accounts")
      .select(
        "id, tenant_id, provider, access_token, refresh_token, token_expires_at",
      )
      .eq("is_active", true)
      .lt("token_expires_at", fiveMinutesFromNow.toISOString())
      .not("refresh_token", "is", null);

    if (error) {
      console.error(
        "[TokenRefresh] Failed to query expiring tokens:",
        error.message,
      );
      return [];
    }

    if (!accounts || accounts.length === 0) {
      console.log("[TokenRefresh] No tokens expiring soon");
      return [];
    }

    console.log(
      `[TokenRefresh] Found ${accounts.length} tokens expiring soon, refreshing...`,
    );

    // Refresh all expiring tokens
    const results: TokenRefreshResult[] = [];

    for (const account of accounts) {
      const result = await refreshAccountToken(
        account.id,
        account.provider as "gmail" | "outlook",
        account.refresh_token!,
        account.tenant_id,
      );

      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `[TokenRefresh] Refresh complete: ${successCount} success, ${failureCount} failures`,
    );

    return results;
  } catch (error) {
    console.error("[TokenRefresh] checkAndRefreshExpiring error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get fresh access token (auto-refresh if needed)
 * Use this before making API calls
 */
export async function getFreshAccessToken(
  accountId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { data: account, error } = await supabase
      .from("exo_email_accounts")
      .select("provider, access_token, refresh_token, token_expires_at")
      .eq("id", accountId)
      .single();

    if (error || !account) {
      console.error("[TokenRefresh] Account not found:", {
        accountId,
        error: error?.message,
      });
      return null;
    }

    const expiresAt = new Date(account.token_expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    // Token still valid for >5min - return it
    if (expiresAt > fiveMinutesFromNow) {
      return account.access_token;
    }

    // Token expiring soon - refresh it
    console.log("[TokenRefresh] Token expiring soon, refreshing...", {
      accountId,
      expiresAt: expiresAt.toISOString(),
    });

    const result = await refreshAccountToken(
      accountId,
      account.provider as "gmail" | "outlook",
      account.refresh_token!,
      tenantId,
    );

    if (!result.success) {
      console.error("[TokenRefresh] Refresh failed:", {
        accountId,
        error: result.error,
      });
      return null;
    }

    return result.newAccessToken!;
  } catch (error) {
    console.error("[TokenRefresh] getFreshAccessToken error:", {
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
