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
    console.error("[OAuth] Token exchange failed:", error);
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
    console.error("[OAuth] Token refresh failed:", error);
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

// Core Google Scopes (Gmail + Calendar - primary use case)
const GOOGLE_CORE_SCOPES = [
  ...GOOGLE_MINIMAL_SCOPES,

  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",

  // Calendar
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
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
    scopes: GOOGLE_COMPREHENSIVE_SCOPES,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${BASE_URL}/api/rigs/google/callback`,
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
