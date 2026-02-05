// =====================================================
// RIGS - External API Integrations
// =====================================================

export type RigCategory =
  | "health"
  | "productivity"
  | "finance"
  | "smart_home"
  | "social";

export type RigSlug =
  | "google" // Unified Google (Fit + Workspace + YouTube)
  | "oura"
  | "fitbit"
  | "apple-health"
  | "google-calendar"
  | "google-fit"
  | "google-workspace"
  | "microsoft-365"
  | "notion"
  | "todoist"
  | "philips-hue"
  | "home-assistant"
  | "plaid"
  | "stripe"
  | "health-connect"
  | "facebook"
  | "apple"
  | "spotify";

export interface RigDefinition {
  slug: RigSlug;
  name: string;
  description: string;
  icon: string;
  category: RigCategory;

  // OAuth configuration
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    clientIdEnv: string;
    clientSecretEnv: string;
  };

  // API configuration
  api: {
    baseUrl: string;
    rateLimit?: {
      requests: number;
      period: "second" | "minute" | "hour" | "day";
    };
  };

  // Sync configuration
  sync: {
    frequency: "realtime" | "hourly" | "daily";
    dataTypes: string[];
  };
}

export interface RigConnection {
  id: string;
  tenant_id: string;
  rig_slug: RigSlug;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  last_sync_at: string | null;
  sync_status: "pending" | "syncing" | "success" | "error";
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RigSyncResult {
  success: boolean;
  records_synced: number;
  error?: string;
  data_range?: {
    from: string;
    to: string;
  };
}

// Base interface for all Rig clients
export interface IRigClient {
  readonly slug: RigSlug;

  // Authentication
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>;
  refreshToken(refresh_token: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;

  // Data sync
  sync(connection: RigConnection): Promise<RigSyncResult>;
}
