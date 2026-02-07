/**
 * In-Chat Integration Connector
 *
 * Enables users to connect external services (Google, Oura, Todoist, etc.)
 * directly from messaging channels via magic-link OAuth.
 *
 * Flow:
 * 1. User says "connect Google Calendar" in any channel
 * 2. connect_rig tool calls generateMagicConnectLink()
 * 3. Magic token stored in exo_rig_connections.metadata
 * 4. User gets link → opens in browser → OAuth flow
 * 5. Callback validates magic token → saves tokens
 * 6. Confirmation sent back via user's preferred channel
 */

import { randomBytes } from "crypto";
import { supportsOAuth } from "./oauth";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";

const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a magic-link URL for OAuth without requiring browser login.
 * Returns a URL the user can open to connect an integration.
 */
export async function generateMagicConnectLink(
  tenantId: string,
  rigSlug: string,
): Promise<{ url: string; expiresAt: Date; rigName: string }> {
  if (!supportsOAuth(rigSlug)) {
    throw new Error(`Integration "${rigSlug}" does not support OAuth`);
  }

  const supabase = getServiceSupabase();
  const magicToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAGIC_TOKEN_TTL_MS);

  // Upsert connection record with magic token
  const { error } = await supabase.from("exo_rig_connections").upsert(
    {
      tenant_id: tenantId,
      rig_slug: rigSlug,
      metadata: {
        magic_token: magicToken,
        magic_token_expires: expiresAt.toISOString(),
        magic_initiated_at: new Date().toISOString(),
      },
      sync_status: "pending",
    },
    { onConflict: "tenant_id,rig_slug" },
  );

  if (error) {
    console.error("[InChatConnector] Failed to store magic token:", {
      tenantId,
      rigSlug,
      error: error.message,
    });
    throw new Error(`Failed to generate connect link: ${error.message}`);
  }

  // Rig display names
  const rigNames: Record<string, string> = {
    google: "Google",
    "google-fit": "Google Fit",
    "google-calendar": "Google Calendar",
    "google-workspace": "Google Workspace",
    "microsoft-365": "Microsoft 365",
    oura: "Oura Ring",
    fitbit: "Fitbit",
    notion: "Notion",
    todoist: "Todoist",
    spotify: "Spotify",
    facebook: "Facebook",
    apple: "Apple",
  };

  const url = `${APP_URL}/api/rigs/${rigSlug}/magic-connect?t=${magicToken}`;

  logger.info("[InChatConnector] Magic link generated:", {
    tenantId,
    rigSlug,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    url,
    expiresAt,
    rigName: rigNames[rigSlug] || rigSlug,
  };
}

/**
 * Validate a magic token and return the associated tenant.
 * Returns null if token is invalid or expired.
 */
export async function validateMagicToken(
  rigSlug: string,
  magicToken: string,
): Promise<{ tenantId: string; connectionId: string } | null> {
  const supabase = getServiceSupabase();

  const { data: connection } = await supabase
    .from("exo_rig_connections")
    .select("id, tenant_id, metadata")
    .eq("rig_slug", rigSlug)
    .single();

  // Search across all connections for this rig with matching token
  // (can't filter on JSONB in eq easily, so fetch and check)
  const { data: connections } = await supabase
    .from("exo_rig_connections")
    .select("id, tenant_id, metadata")
    .eq("rig_slug", rigSlug);

  if (!connections) return null;

  for (const conn of connections) {
    const meta = conn.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    if (meta.magic_token !== magicToken) continue;

    // Check expiry
    const expires = meta.magic_token_expires as string | undefined;
    if (expires && new Date(expires).getTime() < Date.now()) {
      logger.warn("[InChatConnector] Magic token expired:", {
        tenantId: conn.tenant_id,
        rigSlug,
      });
      return null;
    }

    return {
      tenantId: conn.tenant_id,
      connectionId: conn.id,
    };
  }

  return null;
}

/**
 * Clear magic token after successful OAuth.
 */
export async function clearMagicToken(connectionId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: conn } = await supabase
    .from("exo_rig_connections")
    .select("metadata")
    .eq("id", connectionId)
    .single();

  if (!conn) return;

  const metadata = (conn.metadata as Record<string, unknown>) || {};
  delete metadata.magic_token;
  delete metadata.magic_token_expires;

  await supabase
    .from("exo_rig_connections")
    .update({ metadata })
    .eq("id", connectionId);
}

/**
 * List available integrations that can be connected.
 */
export function getAvailableRigs(): Array<{
  slug: string;
  name: string;
  description: string;
}> {
  return [
    {
      slug: "google",
      name: "Google",
      description: "Gmail, Calendar, Drive, Tasks, Contacts",
    },
    {
      slug: "oura",
      name: "Oura Ring",
      description: "Sleep, HRV, readiness, activity",
    },
    {
      slug: "fitbit",
      name: "Fitbit",
      description: "Steps, sleep, heart rate",
    },
    {
      slug: "todoist",
      name: "Todoist",
      description: "Tasks, projects",
    },
    {
      slug: "notion",
      name: "Notion",
      description: "Databases, pages, notes",
    },
    {
      slug: "spotify",
      name: "Spotify",
      description: "Music, playlists, playback",
    },
    {
      slug: "microsoft-365",
      name: "Microsoft 365",
      description: "Outlook, Calendar, OneDrive, Teams",
    },
  ];
}
