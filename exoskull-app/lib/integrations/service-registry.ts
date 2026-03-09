/**
 * Service Registry — Pre-built configurations for popular services
 *
 * Each entry contains:
 * - OAuth2/API key config (auth URLs, scopes, etc.)
 * - API base URL
 * - Available capabilities (what the agent can do with this service)
 *
 * This eliminates the need for live API doc discovery for common services.
 * The agent uses this registry first; if the service isn't here, it falls
 * back to live discovery via search_web + fetch_url.
 */

export interface ServiceRegistryEntry {
  name: string;
  slug: string;
  description: string;
  icon: string; // emoji
  category: ServiceCategory;

  // Auth
  auth_method: "oauth2" | "api_key" | "webhook";
  oauth2?: {
    authorization_url: string;
    token_url: string;
    scopes: string[];
    /** Some services need custom params on auth URL */
    extra_auth_params?: Record<string, string>;
  };
  api_key?: {
    /** Where user gets their API key */
    docs_url: string;
    /** Header name for API key */
    header_name: string;
    /** Header prefix (e.g., "Bearer", "Token") */
    header_prefix?: string;
  };

  // API
  api_base_url: string;

  // Capabilities
  capabilities: string[];

  // Required env vars (client_id, client_secret must be set)
  env_client_id?: string;
  env_client_secret?: string;
}

export type ServiceCategory =
  | "communication"
  | "productivity"
  | "health"
  | "finance"
  | "social"
  | "developer"
  | "storage"
  | "crm"
  | "ecommerce"
  | "media"
  | "ai";

// ============================================================================
// REGISTRY
// ============================================================================

export const SERVICE_REGISTRY: ServiceRegistryEntry[] = [
  // ── Communication ──
  {
    name: "Gmail",
    slug: "gmail",
    description: "Read, send, and manage email via Gmail API",
    icon: "📧",
    category: "communication",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      extra_auth_params: { access_type: "offline", prompt: "consent" },
    },
    api_base_url: "https://gmail.googleapis.com/gmail/v1",
    capabilities: [
      "read_emails",
      "send_email",
      "search_emails",
      "manage_labels",
      "get_attachments",
    ],
    env_client_id: "GOOGLE_CLIENT_ID",
    env_client_secret: "GOOGLE_CLIENT_SECRET",
  },

  {
    name: "Google Calendar",
    slug: "google-calendar",
    description: "Create, read, and manage calendar events",
    icon: "📅",
    category: "productivity",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      extra_auth_params: { access_type: "offline", prompt: "consent" },
    },
    api_base_url: "https://www.googleapis.com/calendar/v3",
    capabilities: [
      "list_events",
      "create_event",
      "update_event",
      "delete_event",
      "list_calendars",
    ],
    env_client_id: "GOOGLE_CLIENT_ID",
    env_client_secret: "GOOGLE_CLIENT_SECRET",
  },

  {
    name: "Google Drive",
    slug: "google-drive",
    description: "Access, upload, and manage files in Google Drive",
    icon: "📁",
    category: "storage",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ],
      extra_auth_params: { access_type: "offline", prompt: "consent" },
    },
    api_base_url: "https://www.googleapis.com/drive/v3",
    capabilities: [
      "list_files",
      "upload_file",
      "download_file",
      "search_files",
      "share_file",
    ],
    env_client_id: "GOOGLE_CLIENT_ID",
    env_client_secret: "GOOGLE_CLIENT_SECRET",
  },

  {
    name: "Slack",
    slug: "slack",
    description: "Send messages, manage channels, react to events in Slack",
    icon: "💬",
    category: "communication",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://slack.com/oauth/v2/authorize",
      token_url: "https://slack.com/api/oauth.v2.access",
      scopes: [
        "chat:write",
        "channels:read",
        "channels:history",
        "users:read",
        "reactions:write",
      ],
    },
    api_base_url: "https://slack.com/api",
    capabilities: [
      "send_message",
      "list_channels",
      "read_messages",
      "react",
      "upload_file",
    ],
    env_client_id: "SLACK_CLIENT_ID",
    env_client_secret: "SLACK_CLIENT_SECRET",
  },

  {
    name: "Telegram Bot",
    slug: "telegram",
    description: "Send and receive messages via Telegram Bot API",
    icon: "✈️",
    category: "communication",
    auth_method: "api_key",
    api_key: {
      docs_url: "https://core.telegram.org/bots#how-do-i-create-a-bot",
      header_name: "Authorization",
      header_prefix: "Bearer",
    },
    api_base_url: "https://api.telegram.org/bot{api_key}",
    capabilities: ["send_message", "send_photo", "get_updates", "set_webhook"],
  },

  {
    name: "Discord",
    slug: "discord",
    description: "Send messages and manage Discord servers via bot",
    icon: "🎮",
    category: "communication",
    auth_method: "api_key",
    api_key: {
      docs_url: "https://discord.com/developers/docs/getting-started",
      header_name: "Authorization",
      header_prefix: "Bot",
    },
    api_base_url: "https://discord.com/api/v10",
    capabilities: [
      "send_message",
      "read_messages",
      "manage_channels",
      "manage_roles",
    ],
  },

  // ── Productivity ──
  {
    name: "Notion",
    slug: "notion",
    description: "Create pages, databases, and manage content in Notion",
    icon: "📝",
    category: "productivity",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://api.notion.com/v1/oauth/authorize",
      token_url: "https://api.notion.com/v1/oauth/token",
      scopes: [],
    },
    api_base_url: "https://api.notion.com/v1",
    capabilities: [
      "create_page",
      "update_page",
      "search",
      "list_databases",
      "query_database",
    ],
    env_client_id: "NOTION_CLIENT_ID",
    env_client_secret: "NOTION_CLIENT_SECRET",
  },

  {
    name: "Todoist",
    slug: "todoist",
    description: "Create and manage tasks and projects in Todoist",
    icon: "✅",
    category: "productivity",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://todoist.com/oauth/authorize",
      token_url: "https://todoist.com/oauth/access_token",
      scopes: ["data:read_write"],
    },
    api_base_url: "https://api.todoist.com/rest/v2",
    capabilities: [
      "create_task",
      "update_task",
      "complete_task",
      "list_tasks",
      "list_projects",
    ],
    env_client_id: "TODOIST_CLIENT_ID",
    env_client_secret: "TODOIST_CLIENT_SECRET",
  },

  {
    name: "Linear",
    slug: "linear",
    description: "Manage issues, projects, and cycles in Linear",
    icon: "📐",
    category: "productivity",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://linear.app/oauth/authorize",
      token_url: "https://api.linear.app/oauth/token",
      scopes: ["read", "write", "issues:create"],
    },
    api_base_url: "https://api.linear.app/graphql",
    capabilities: [
      "create_issue",
      "update_issue",
      "list_issues",
      "search",
      "manage_projects",
    ],
    env_client_id: "LINEAR_CLIENT_ID",
    env_client_secret: "LINEAR_CLIENT_SECRET",
  },

  // ── Health & Fitness ──
  {
    name: "Oura Ring",
    slug: "oura",
    description: "Read sleep, activity, and readiness data from Oura Ring",
    icon: "💍",
    category: "health",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://cloud.ouraring.com/oauth/authorize",
      token_url: "https://api.ouraring.com/oauth/token",
      scopes: ["daily", "heartrate", "personal", "session", "workout"],
    },
    api_base_url: "https://api.ouraring.com/v2",
    capabilities: [
      "get_sleep",
      "get_activity",
      "get_readiness",
      "get_heart_rate",
      "get_workouts",
    ],
    env_client_id: "OURA_CLIENT_ID",
    env_client_secret: "OURA_CLIENT_SECRET",
  },

  {
    name: "Fitbit",
    slug: "fitbit",
    description: "Read steps, sleep, heart rate, and activity from Fitbit",
    icon: "⌚",
    category: "health",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://www.fitbit.com/oauth2/authorize",
      token_url: "https://api.fitbit.com/oauth2/token",
      scopes: [
        "activity",
        "heartrate",
        "sleep",
        "weight",
        "profile",
        "settings",
      ],
    },
    api_base_url: "https://api.fitbit.com/1/user/-",
    capabilities: [
      "get_steps",
      "get_sleep",
      "get_heart_rate",
      "get_weight",
      "get_activities",
    ],
    env_client_id: "FITBIT_CLIENT_ID",
    env_client_secret: "FITBIT_CLIENT_SECRET",
  },

  {
    name: "Google Fit",
    slug: "google-fit",
    description: "Access health and fitness data from Google Fit",
    icon: "🏃",
    category: "health",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
      ],
      extra_auth_params: { access_type: "offline", prompt: "consent" },
    },
    api_base_url: "https://www.googleapis.com/fitness/v1/users/me",
    capabilities: ["get_activity", "get_sleep", "get_heart_rate", "get_steps"],
    env_client_id: "GOOGLE_CLIENT_ID",
    env_client_secret: "GOOGLE_CLIENT_SECRET",
  },

  // ── Finance ──
  {
    name: "Stripe",
    slug: "stripe",
    description: "Manage payments, customers, and subscriptions via Stripe",
    icon: "💳",
    category: "finance",
    auth_method: "api_key",
    api_key: {
      docs_url: "https://dashboard.stripe.com/apikeys",
      header_name: "Authorization",
      header_prefix: "Bearer",
    },
    api_base_url: "https://api.stripe.com/v1",
    capabilities: [
      "list_payments",
      "create_payment",
      "list_customers",
      "manage_subscriptions",
      "get_balance",
    ],
  },

  // ── Social ──
  {
    name: "Spotify",
    slug: "spotify",
    description: "Control playback, manage playlists, get listening history",
    icon: "🎵",
    category: "media",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://accounts.spotify.com/authorize",
      token_url: "https://accounts.spotify.com/api/token",
      scopes: [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-recently-played",
        "playlist-read-private",
        "playlist-modify-public",
      ],
    },
    api_base_url: "https://api.spotify.com/v1",
    capabilities: [
      "get_playing",
      "play_track",
      "pause",
      "skip",
      "list_playlists",
      "search",
    ],
    env_client_id: "SPOTIFY_CLIENT_ID",
    env_client_secret: "SPOTIFY_CLIENT_SECRET",
  },

  // ── Developer ──
  {
    name: "GitHub",
    slug: "github",
    description: "Manage repos, issues, PRs, and code on GitHub",
    icon: "🐙",
    category: "developer",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://github.com/login/oauth/authorize",
      token_url: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "user", "read:org"],
    },
    api_base_url: "https://api.github.com",
    capabilities: [
      "list_repos",
      "create_issue",
      "create_pr",
      "search_code",
      "get_profile",
    ],
    env_client_id: "GITHUB_CLIENT_ID",
    env_client_secret: "GITHUB_CLIENT_SECRET",
  },

  // ── CRM ──
  {
    name: "HubSpot",
    slug: "hubspot",
    description: "Manage contacts, deals, and marketing in HubSpot CRM",
    icon: "🧲",
    category: "crm",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://app.hubspot.com/oauth/authorize",
      token_url: "https://api.hubapi.com/oauth/v1/token",
      scopes: [
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.deals.read",
      ],
    },
    api_base_url: "https://api.hubapi.com",
    capabilities: [
      "list_contacts",
      "create_contact",
      "list_deals",
      "create_deal",
      "search",
    ],
    env_client_id: "HUBSPOT_CLIENT_ID",
    env_client_secret: "HUBSPOT_CLIENT_SECRET",
  },

  // ── E-commerce ──
  {
    name: "Shopify",
    slug: "shopify",
    description: "Manage products, orders, and customers in Shopify store",
    icon: "🛒",
    category: "ecommerce",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://{shop}.myshopify.com/admin/oauth/authorize",
      token_url: "https://{shop}.myshopify.com/admin/oauth/access_token",
      scopes: [
        "read_products",
        "write_products",
        "read_orders",
        "read_customers",
      ],
    },
    api_base_url: "https://{shop}.myshopify.com/admin/api/2024-01",
    capabilities: [
      "list_products",
      "create_product",
      "list_orders",
      "list_customers",
      "manage_inventory",
    ],
    env_client_id: "SHOPIFY_CLIENT_ID",
    env_client_secret: "SHOPIFY_CLIENT_SECRET",
  },

  // ── AI ──
  {
    name: "OpenAI",
    slug: "openai",
    description: "Use GPT models, DALL-E, embeddings via OpenAI API",
    icon: "🤖",
    category: "ai",
    auth_method: "api_key",
    api_key: {
      docs_url: "https://platform.openai.com/api-keys",
      header_name: "Authorization",
      header_prefix: "Bearer",
    },
    api_base_url: "https://api.openai.com/v1",
    capabilities: [
      "chat_completion",
      "generate_image",
      "create_embedding",
      "text_to_speech",
    ],
  },

  // ── Storage ──
  {
    name: "Dropbox",
    slug: "dropbox",
    description: "Access, upload, and manage files in Dropbox",
    icon: "📦",
    category: "storage",
    auth_method: "oauth2",
    oauth2: {
      authorization_url: "https://www.dropbox.com/oauth2/authorize",
      token_url: "https://api.dropboxapi.com/oauth2/token",
      scopes: [],
    },
    api_base_url: "https://api.dropboxapi.com/2",
    capabilities: [
      "list_files",
      "upload_file",
      "download_file",
      "search",
      "share_file",
    ],
    env_client_id: "DROPBOX_CLIENT_ID",
    env_client_secret: "DROPBOX_CLIENT_SECRET",
  },

  {
    name: "Microsoft 365",
    slug: "microsoft-365",
    description:
      "Access Outlook mail, OneDrive, Teams, Calendar via Microsoft Graph",
    icon: "🪟",
    category: "productivity",
    auth_method: "oauth2",
    oauth2: {
      authorization_url:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: [
        "User.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Files.ReadWrite",
      ],
    },
    api_base_url: "https://graph.microsoft.com/v1.0",
    capabilities: [
      "read_mail",
      "send_mail",
      "calendar_events",
      "onedrive_files",
      "teams_messages",
    ],
    env_client_id: "MICROSOFT_CLIENT_ID",
    env_client_secret: "MICROSOFT_CLIENT_SECRET",
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Find service by slug or name (fuzzy) */
export function findService(query: string): ServiceRegistryEntry | undefined {
  const lower = query.toLowerCase().trim();

  // Exact slug match
  const bySlug = SERVICE_REGISTRY.find((s) => s.slug === lower);
  if (bySlug) return bySlug;

  // Exact name match (case-insensitive)
  const byName = SERVICE_REGISTRY.find((s) => s.name.toLowerCase() === lower);
  if (byName) return byName;

  // Partial match
  return SERVICE_REGISTRY.find(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.slug.includes(lower) ||
      lower.includes(s.slug),
  );
}

/** List services by category */
export function listServicesByCategory(
  category?: ServiceCategory,
): ServiceRegistryEntry[] {
  if (!category) return SERVICE_REGISTRY;
  return SERVICE_REGISTRY.filter((s) => s.category === category);
}

/** Get categories with counts */
export function getCategories(): Array<{
  category: ServiceCategory;
  count: number;
}> {
  const counts = new Map<ServiceCategory, number>();
  for (const s of SERVICE_REGISTRY) {
    counts.set(s.category, (counts.get(s.category) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({
    category,
    count,
  }));
}

/** Check if service has required env vars configured */
export function isServiceConfigured(entry: ServiceRegistryEntry): boolean {
  if (entry.auth_method === "api_key") return true; // User provides key
  if (entry.env_client_id && !process.env[entry.env_client_id]) return false;
  if (entry.env_client_secret && !process.env[entry.env_client_secret])
    return false;
  return true;
}
