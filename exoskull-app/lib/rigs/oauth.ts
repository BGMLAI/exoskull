// =====================================================
// UNIVERSAL OAUTH HANDLER FOR RIGS
// =====================================================

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  // Some providers need extra params
  extraAuthParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// Build authorization URL
export function buildAuthUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    access_type: "offline", // Get refresh token
    prompt: "consent", // Force consent to get refresh token
    ...config.extraAuthParams,
  });

  return `${config.authUrl}?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...config.extraTokenParams,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("[OAuth] Token exchange failed:", error);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

// Refresh access token
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("[OAuth] Token refresh failed:", error);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

// =====================================================
// RIG-SPECIFIC OAUTH CONFIGURATIONS
// =====================================================

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Minimal Google Scopes (profile only)
const GOOGLE_MINIMAL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// Core Google Scopes (Gmail + Calendar + Fit + Tasks + Drive + Contacts + Ads + Analytics)
const GOOGLE_CORE_SCOPES = [
  ...GOOGLE_MINIMAL_SCOPES,

  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",

  // Calendar (full read/write)
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",

  // Tasks
  "https://www.googleapis.com/auth/tasks",

  // Drive
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",

  // Contacts (full read/write)
  "https://www.googleapis.com/auth/contacts",

  // Google Fit (read + write)
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.activity.write",
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/fitness.heart_rate.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.body.write",
  "https://www.googleapis.com/auth/fitness.nutrition.read",
  "https://www.googleapis.com/auth/fitness.location.read",
  "https://www.googleapis.com/auth/fitness.blood_glucose.read",
  "https://www.googleapis.com/auth/fitness.blood_pressure.read",

  // Google Ads
  "https://www.googleapis.com/auth/adwords",

  // Google Analytics
  "https://www.googleapis.com/auth/analytics.readonly",
];

// Full Google Scopes (enable after OAuth confirmed working + APIs enabled in GCP)
const GOOGLE_COMPREHENSIVE_SCOPES = [
  ...GOOGLE_MINIMAL_SCOPES,

  // Google Fit (Health & Fitness)
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.activity.write",
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/fitness.sleep.write",
  "https://www.googleapis.com/auth/fitness.heart_rate.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.body.write",
  "https://www.googleapis.com/auth/fitness.nutrition.read",
  "https://www.googleapis.com/auth/fitness.location.read",
  "https://www.googleapis.com/auth/fitness.blood_glucose.read",
  "https://www.googleapis.com/auth/fitness.blood_pressure.read",
  "https://www.googleapis.com/auth/fitness.oxygen_saturation.read",
  "https://www.googleapis.com/auth/fitness.body_temperature.read",
  "https://www.googleapis.com/auth/fitness.reproductive_health.read",

  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",

  // Calendar
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",

  // Drive
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",

  // Docs, Sheets, Slides
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",

  // Tasks
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/tasks.readonly",

  // Contacts
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",

  // YouTube
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",

  // Photos
  "https://www.googleapis.com/auth/photoslibrary.readonly",
];

export const RIG_OAUTH_CONFIGS: Record<string, () => OAuthConfig> = {
  // =====================================================
  // GOOGLE UNIFIED (ALL SERVICES - RECOMMENDED)
  // =====================================================
  google: () => ({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: GOOGLE_CORE_SCOPES,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/google/callback`,
    extraAuthParams: {
      include_granted_scopes: "true", // Incremental auth - add more scopes later
    },
  }),

  // Google Fit / HealthConnect (legacy - use 'google' instead)
  "google-fit": () => ({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: GOOGLE_COMPREHENSIVE_SCOPES,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/google-fit/callback`,
  }),

  // Google Workspace (legacy - use 'google' instead)
  "google-workspace": () => ({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: GOOGLE_COMPREHENSIVE_SCOPES,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/google-workspace/callback`,
  }),

  // Google Calendar (standalone)
  "google-calendar": () => ({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: GOOGLE_COMPREHENSIVE_SCOPES,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/google-calendar/callback`,
  }),

  // Microsoft 365
  "microsoft-365": () => ({
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      // Mail
      "Mail.Read",
      "Mail.Send",
      // Calendar
      "Calendars.Read",
      "Calendars.ReadWrite",
      // OneDrive
      "Files.Read",
      "Files.ReadWrite",
      // Teams
      "Chat.Read",
      "Chat.ReadWrite",
      "Team.ReadBasic.All",
      // SharePoint
      "Sites.Read.All",
      // OneNote
      "Notes.Read",
      // Profile
      "User.Read",
      "offline_access",
    ],
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/microsoft-365/callback`,
  }),

  // Oura
  oura: () => ({
    authUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    scopes: ["daily", "heartrate", "workout", "tag", "session", "personal"],
    clientId: process.env.OURA_CLIENT_ID || "",
    clientSecret: process.env.OURA_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/oura/callback`,
  }),

  // Fitbit
  fitbit: () => ({
    authUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    scopes: ["activity", "heartrate", "sleep", "profile", "settings"],
    clientId: process.env.FITBIT_CLIENT_ID || "",
    clientSecret: process.env.FITBIT_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/fitbit/callback`,
    extraAuthParams: {
      expires_in: "604800", // 7 days
    },
  }),

  // Notion
  notion: () => ({
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [], // Notion doesn't use scopes
    clientId: process.env.NOTION_CLIENT_ID || "",
    clientSecret: process.env.NOTION_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/notion/callback`,
    extraAuthParams: {
      owner: "user",
    },
  }),

  // Todoist
  todoist: () => ({
    authUrl: "https://todoist.com/oauth/authorize",
    tokenUrl: "https://todoist.com/oauth/access_token",
    scopes: ["data:read_write"],
    clientId: process.env.TODOIST_CLIENT_ID || "",
    clientSecret: process.env.TODOIST_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/todoist/callback`,
  }),

  // Spotify
  spotify: () => ({
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scopes: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "playlist-read-private",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-library-read",
    ],
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/spotify/callback`,
  }),

  // =====================================================
  // FACEBOOK / META (Graph API + Instagram)
  // =====================================================
  facebook: () => ({
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      // Core
      "email",
      "public_profile",
      "user_posts",
      "user_photos",
      "user_friends",
      "user_videos",
      "user_events",
      "user_likes",
      // Pages
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_metadata",
      "pages_read_user_content",
      // Instagram (requires FB Page linked to IG Business)
      "instagram_basic",
      "instagram_manage_insights",
      "instagram_content_publish",
      "instagram_manage_messages",
      // Ads / Marketing API
      "ads_management",
      "ads_read",
      "business_management",
      // Commerce / Catalog
      "catalog_management",
      // WhatsApp (Cloud API management via same app)
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ],
    clientId: process.env.FACEBOOK_APP_ID || "",
    clientSecret: process.env.FACEBOOK_APP_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/facebook/callback`,
  }),

  // =====================================================
  // THREADS (Instagram Threads via graph.threads.net)
  // =====================================================
  threads: () => ({
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_insights",
      "threads_manage_replies",
      "threads_read_replies",
    ],
    clientId: process.env.THREADS_APP_ID || process.env.FACEBOOK_APP_ID || "",
    clientSecret:
      process.env.THREADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/threads/callback`,
  }),

  // =====================================================
  // APPLE SIGN-IN
  // =====================================================
  apple: () => ({
    authUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    scopes: ["name", "email"],
    clientId: process.env.APPLE_CLIENT_ID || "",
    clientSecret: process.env.APPLE_CLIENT_SECRET || "", // JWT generated at runtime
    redirectUri: `${BASE_URL}/api/rigs/apple/callback`,
    extraAuthParams: {
      response_mode: "form_post",
    },
  }),
};

// Get OAuth config for a rig
export function getOAuthConfig(rigSlug: string): OAuthConfig | null {
  const configFn = RIG_OAUTH_CONFIGS[rigSlug];
  if (!configFn) return null;
  return configFn();
}

// Check if rig supports OAuth
export function supportsOAuth(rigSlug: string): boolean {
  return rigSlug in RIG_OAUTH_CONFIGS;
}

// =====================================================
// TOKEN REFRESH HELPER
// =====================================================

import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Ensure the access token for a rig connection is fresh.
 * If token expires within 5 minutes, refresh it and update DB.
 * Returns the (possibly refreshed) access_token.
 */
export async function ensureFreshToken(connection: {
  id: string;
  rig_slug: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}): Promise<string> {
  if (!connection.access_token) {
    throw new Error(`[OAuth] No access token for ${connection.rig_slug}`);
  }

  // If no expiry info, assume token is valid
  if (!connection.expires_at) {
    return connection.access_token;
  }

  const expiresAt = new Date(connection.expires_at).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  // Token still valid for >5 minutes
  if (expiresAt - now > fiveMinutes) {
    return connection.access_token;
  }

  // Token expired or expiring soon - refresh it
  if (!connection.refresh_token) {
    throw new Error(
      `[OAuth] Token expired for ${connection.rig_slug} and no refresh_token available`,
    );
  }

  const config = getOAuthConfig(connection.rig_slug);
  if (!config) {
    throw new Error(
      `[OAuth] No OAuth config for ${connection.rig_slug} - cannot refresh`,
    );
  }

  logger.info(
    `[OAuth] Refreshing token for ${connection.rig_slug} (expires: ${connection.expires_at})`,
  );

  try {
    const tokens = await refreshAccessToken(config, connection.refresh_token);

    const newExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Update DB with new tokens
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("exo_rig_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || connection.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (error) {
      logger.error(
        `[OAuth] Failed to save refreshed token for ${connection.rig_slug}:`,
        error,
      );
    }

    return tokens.access_token;
  } catch (error) {
    logger.error(
      `[OAuth] Token refresh failed for ${connection.rig_slug}:`,
      error,
    );
    throw error;
  }
}
