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
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Force consent to get refresh token
    ...config.extraAuthParams,
  });

  return `${config.authUrl}?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...config.extraTokenParams,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OAuth] Token exchange failed:', error);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

// Refresh access token
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OAuth] Token refresh failed:', error);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

// =====================================================
// RIG-SPECIFIC OAUTH CONFIGURATIONS
// =====================================================

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const RIG_OAUTH_CONFIGS: Record<string, () => OAuthConfig> = {
  // Google Fit / HealthConnect
  'google-fit': () => ({
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.sleep.read',
      'https://www.googleapis.com/auth/fitness.heart_rate.read',
      'https://www.googleapis.com/auth/fitness.body.read',
      'https://www.googleapis.com/auth/fitness.location.read',
    ],
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/google-fit/callback`,
  }),

  // Google Workspace (Gmail, Calendar, Drive, Tasks)
  'google-workspace': () => ({
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      // Gmail
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.labels',
      // Calendar
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      // Drive
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      // Tasks
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/tasks.readonly',
      // Profile
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/google-workspace/callback`,
  }),

  // Google Calendar (standalone)
  'google-calendar': () => ({
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/google-calendar/callback`,
  }),

  // Microsoft 365
  'microsoft-365': () => ({
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      // Mail
      'Mail.Read',
      'Mail.Send',
      // Calendar
      'Calendars.Read',
      'Calendars.ReadWrite',
      // OneDrive
      'Files.Read',
      'Files.ReadWrite',
      // Profile
      'User.Read',
      'offline_access',
    ],
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/microsoft-365/callback`,
  }),

  // Oura
  'oura': () => ({
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['daily', 'heartrate', 'workout', 'tag', 'session', 'personal'],
    clientId: process.env.OURA_CLIENT_ID || '',
    clientSecret: process.env.OURA_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/oura/callback`,
  }),

  // Fitbit
  'fitbit': () => ({
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scopes: ['activity', 'heartrate', 'sleep', 'profile', 'settings'],
    clientId: process.env.FITBIT_CLIENT_ID || '',
    clientSecret: process.env.FITBIT_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/fitbit/callback`,
    extraAuthParams: {
      expires_in: '604800', // 7 days
    },
  }),

  // Notion
  'notion': () => ({
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [], // Notion doesn't use scopes
    clientId: process.env.NOTION_CLIENT_ID || '',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/notion/callback`,
    extraAuthParams: {
      owner: 'user',
    },
  }),

  // Todoist
  'todoist': () => ({
    authUrl: 'https://todoist.com/oauth/authorize',
    tokenUrl: 'https://todoist.com/oauth/access_token',
    scopes: ['data:read_write'],
    clientId: process.env.TODOIST_CLIENT_ID || '',
    clientSecret: process.env.TODOIST_CLIENT_SECRET || '',
    redirectUri: `${BASE_URL}/api/rigs/todoist/callback`,
  }),

  // Spotify
  'spotify': () => ({
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
    ],
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
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
