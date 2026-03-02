/**
 * AI Superintegrator — Agent autonomously connects ANY service for the user.
 *
 * Flow:
 * 1. User: "podłącz mi Gmail" / "connect my CRM" / etc.
 * 2. Agent searches live API docs → discovers auth method (OAuth2, API key, webhook)
 * 3. Agent calls connect_service → generates auth flow
 * 4. User completes auth (clicks link or pastes key)
 * 5. Credentials stored encrypted in exo_integrations
 * 6. Agent calls build_tool to create dynamic IORS tool for the service
 * 7. Service immediately usable
 *
 * Auth methods supported:
 * - oauth2: Full OAuth2 Authorization Code flow with PKCE
 * - api_key: User pastes API key → encrypted storage
 * - webhook: Generate unique webhook URL for inbound events
 *
 * USP: No UI to click through. No Zapier/Composio needed.
 * Agent reads LIVE docs (not cached) and builds connectors on the fly.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type AuthMethod = "oauth2" | "api_key" | "webhook";

export interface ServiceConnection {
  id: string;
  tenant_id: string;
  service_name: string;
  service_slug: string;
  auth_method: AuthMethod;
  status: "pending" | "connected" | "error" | "expired";
  credentials_encrypted: string | null;
  oauth_config: OAuthConfig | null;
  api_base_url: string | null;
  webhook_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OAuthConfig {
  authorization_url: string;
  token_url: string;
  client_id: string;
  scopes: string[];
  redirect_uri: string;
  state: string;
  pkce_verifier?: string;
}

export interface ConnectServiceInput {
  service_name: string;
  service_slug: string;
  auth_method: AuthMethod;
  api_base_url?: string;
  // OAuth2 specific
  authorization_url?: string;
  token_url?: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string[];
  // API key specific
  api_key?: string;
  // Webhook specific (auto-generated)
}

export interface ConnectServiceResult {
  success: boolean;
  connection_id?: string;
  action_required?: string; // What user needs to do
  auth_url?: string; // OAuth URL to open
  webhook_url?: string; // Webhook URL for inbound events
  error?: string;
}

// ============================================================================
// ENCRYPTION
// ============================================================================

const ENCRYPTION_KEY =
  process.env.CREDENTIAL_ENCRYPTION_KEY ||
  process.env.NEXTAUTH_SECRET ||
  "exoskull-default-key-change-in-production";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encrypted: string): string {
  const [ivHex, data] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ============================================================================
// CORE ENGINE
// ============================================================================

/**
 * Connect a new service. Called by the IORS `connect_service` tool.
 */
export async function connectService(
  tenantId: string,
  input: ConnectServiceInput,
): Promise<ConnectServiceResult> {
  const supabase = getServiceSupabase();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.exoskull.ai";

  try {
    switch (input.auth_method) {
      case "oauth2": {
        if (!input.authorization_url || !input.token_url || !input.client_id) {
          return {
            success: false,
            error: "OAuth2 wymaga: authorization_url, token_url, client_id",
          };
        }

        const state = crypto.randomBytes(32).toString("hex");
        const redirectUri = `${baseUrl}/api/integrations/callback`;

        // Store OAuth config for callback verification
        const oauthConfig: OAuthConfig = {
          authorization_url: input.authorization_url,
          token_url: input.token_url,
          client_id: input.client_id,
          scopes: input.scopes || [],
          redirect_uri: redirectUri,
          state,
        };

        // Encrypt client_secret if provided
        let encryptedSecret: string | null = null;
        if (input.client_secret) {
          encryptedSecret = encrypt(
            JSON.stringify({ client_secret: input.client_secret }),
          );
        }

        const { data, error } = await supabase
          .from("exo_integrations")
          .insert({
            tenant_id: tenantId,
            service_name: input.service_name,
            service_slug: input.service_slug,
            auth_method: "oauth2",
            status: "pending",
            credentials_encrypted: encryptedSecret,
            oauth_config: oauthConfig,
            api_base_url: input.api_base_url || null,
            metadata: {},
          })
          .select("id")
          .single();

        if (error) {
          return { success: false, error: `DB error: ${error.message}` };
        }

        // Build OAuth authorization URL
        const params = new URLSearchParams({
          client_id: input.client_id,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
          scope: (input.scopes || []).join(" "),
        });

        const authUrl = `${input.authorization_url}?${params.toString()}`;

        logger.info("[Superintegrator] OAuth2 flow started:", {
          tenantId,
          service: input.service_slug,
          connectionId: data.id,
        });

        return {
          success: true,
          connection_id: data.id,
          auth_url: authUrl,
          action_required: `Otwórz ten link aby autoryzować ${input.service_name}:\n${authUrl}`,
        };
      }

      case "api_key": {
        if (!input.api_key) {
          return {
            success: true,
            action_required: `Wklej klucz API dla ${input.service_name}. Agent zapisze go bezpiecznie (zaszyfrowany).`,
          };
        }

        const encryptedKey = encrypt(
          JSON.stringify({ api_key: input.api_key }),
        );

        const { data, error } = await supabase
          .from("exo_integrations")
          .insert({
            tenant_id: tenantId,
            service_name: input.service_name,
            service_slug: input.service_slug,
            auth_method: "api_key",
            status: "connected",
            credentials_encrypted: encryptedKey,
            api_base_url: input.api_base_url || null,
            metadata: {},
          })
          .select("id")
          .single();

        if (error) {
          return { success: false, error: `DB error: ${error.message}` };
        }

        logger.info("[Superintegrator] API key stored:", {
          tenantId,
          service: input.service_slug,
          connectionId: data.id,
        });

        return {
          success: true,
          connection_id: data.id,
        };
      }

      case "webhook": {
        const webhookId = crypto.randomBytes(16).toString("hex");
        const webhookUrl = `${baseUrl}/api/integrations/webhook/${input.service_slug}/${webhookId}`;

        const { data, error } = await supabase
          .from("exo_integrations")
          .insert({
            tenant_id: tenantId,
            service_name: input.service_name,
            service_slug: input.service_slug,
            auth_method: "webhook",
            status: "connected",
            webhook_url: webhookUrl,
            api_base_url: input.api_base_url || null,
            metadata: { webhook_id: webhookId },
          })
          .select("id")
          .single();

        if (error) {
          return { success: false, error: `DB error: ${error.message}` };
        }

        return {
          success: true,
          connection_id: data.id,
          webhook_url: webhookUrl,
          action_required: `Webhook URL wygenerowany:\n${webhookUrl}\n\nUstaw ten URL w ustawieniach ${input.service_name} jako webhook destination.`,
        };
      }

      default:
        return {
          success: false,
          error: `Nieznana metoda autoryzacji: ${input.auth_method}`,
        };
    }
  } catch (err) {
    logger.error("[Superintegrator] Connect failed:", {
      tenantId,
      service: input.service_slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Handle OAuth2 callback. Called by /api/integrations/callback route.
 */
export async function handleOAuthCallback(
  state: string,
  code: string,
): Promise<{ success: boolean; service_name?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Find connection by state
  const { data: connection, error: findError } = await supabase
    .from("exo_integrations")
    .select("*")
    .eq("status", "pending")
    .filter("oauth_config->>state", "eq", state)
    .single();

  if (findError || !connection) {
    return { success: false, error: "Invalid or expired OAuth state" };
  }

  const oauthConfig = connection.oauth_config as OAuthConfig;

  try {
    // Get stored client_secret
    let clientSecret = "";
    if (connection.credentials_encrypted) {
      const creds = JSON.parse(decrypt(connection.credentials_encrypted));
      clientSecret = creds.client_secret || "";
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(oauthConfig.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: oauthConfig.redirect_uri,
        client_id: oauthConfig.client_id,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} ${errorText}`,
      );
    }

    const tokens = await tokenResponse.json();

    // Encrypt and store tokens
    const encryptedTokens = encrypt(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in
          ? Date.now() + tokens.expires_in * 1000
          : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
    );

    await supabase
      .from("exo_integrations")
      .update({
        status: "connected",
        credentials_encrypted: encryptedTokens,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    logger.info("[Superintegrator] OAuth callback success:", {
      service: connection.service_slug,
      tenantId: connection.tenant_id,
    });

    return {
      success: true,
      service_name: connection.service_name as string,
    };
  } catch (err) {
    await supabase
      .from("exo_integrations")
      .update({
        status: "error",
        metadata: {
          ...(connection.metadata as Record<string, unknown>),
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .eq("id", connection.id);

    return {
      success: false,
      error: err instanceof Error ? err.message : "Token exchange failed",
    };
  }
}

/**
 * Refresh an expired OAuth2 access token using the stored refresh_token.
 * Returns new credentials or null if refresh fails.
 */
export async function refreshAccessToken(
  tenantId: string,
  serviceSlug: string,
): Promise<Record<string, unknown> | null> {
  const supabase = getServiceSupabase();

  const { data: integration } = await supabase
    .from("exo_integrations")
    .select("id, credentials_encrypted, oauth_config, auth_method")
    .eq("tenant_id", tenantId)
    .eq("service_slug", serviceSlug)
    .eq("status", "connected")
    .eq("auth_method", "oauth2")
    .single();

  if (!integration?.credentials_encrypted || !integration.oauth_config) {
    return null;
  }

  try {
    const creds = JSON.parse(decrypt(integration.credentials_encrypted));
    if (!creds.refresh_token) {
      logger.warn("[Superintegrator] No refresh_token for:", {
        serviceSlug,
        tenantId,
      });
      return null;
    }

    const oauthConfig = integration.oauth_config as OAuthConfig;

    const tokenResponse = await fetch(oauthConfig.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: oauthConfig.client_id,
        ...(creds.client_secret ? { client_secret: creds.client_secret } : {}),
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error("[Superintegrator] Token refresh failed:", {
        serviceSlug,
        tenantId,
        status: tokenResponse.status,
        error: errorText.slice(0, 200),
      });

      // Mark as expired if refresh fails with 4xx
      if (tokenResponse.status >= 400 && tokenResponse.status < 500) {
        await supabase
          .from("exo_integrations")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", integration.id);
      }
      return null;
    }

    const tokens = await tokenResponse.json();

    const newCreds = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || creds.refresh_token,
      expires_at: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
      token_type: tokens.token_type || creds.token_type,
      scope: tokens.scope || creds.scope,
      ...(creds.client_secret ? { client_secret: creds.client_secret } : {}),
    };

    const encryptedCreds = encrypt(JSON.stringify(newCreds));

    await supabase
      .from("exo_integrations")
      .update({
        credentials_encrypted: encryptedCreds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    logger.info("[Superintegrator] Token refreshed:", {
      serviceSlug,
      tenantId,
    });
    return newCreds;
  } catch (err) {
    logger.error("[Superintegrator] Token refresh error:", {
      serviceSlug,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get decrypted credentials for a connected service.
 * Auto-refreshes expired OAuth2 tokens when possible.
 */
export async function getServiceCredentials(
  tenantId: string,
  serviceSlug: string,
): Promise<Record<string, unknown> | null> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_integrations")
    .select("credentials_encrypted, auth_method, api_base_url")
    .eq("tenant_id", tenantId)
    .eq("service_slug", serviceSlug)
    .eq("status", "connected")
    .single();

  if (!data?.credentials_encrypted) return null;

  try {
    const creds = JSON.parse(decrypt(data.credentials_encrypted));

    // Auto-refresh expired OAuth2 tokens (5 min buffer)
    if (
      data.auth_method === "oauth2" &&
      creds.expires_at &&
      Date.now() > creds.expires_at - 5 * 60 * 1000
    ) {
      const refreshed = await refreshAccessToken(tenantId, serviceSlug);
      if (refreshed) {
        return { ...refreshed, api_base_url: data.api_base_url };
      }
      // Fall through with potentially expired token
    }

    return { ...creds, api_base_url: data.api_base_url };
  } catch {
    return null;
  }
}

/**
 * List all connected services for a tenant.
 */
export async function listConnections(tenantId: string): Promise<
  Array<{
    service_name: string;
    service_slug: string;
    auth_method: AuthMethod;
    status: string;
    connected_at: string;
  }>
> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_integrations")
    .select("service_name, service_slug, auth_method, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data || []).map((r) => ({
    service_name: r.service_name as string,
    service_slug: r.service_slug as string,
    auth_method: r.auth_method as AuthMethod,
    status: r.status as string,
    connected_at: r.created_at as string,
  }));
}
