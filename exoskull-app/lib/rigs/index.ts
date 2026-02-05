// =====================================================
// RIGS - External API Integrations
// =====================================================

export * from "./types";

// Rig definitions with OAuth and API config
export const RIG_DEFINITIONS = {
  // =====================================================
  // GOOGLE UNIFIED (Recommended - All Google Services)
  // =====================================================
  google: {
    slug: "google" as const,
    name: "Google",
    description:
      "Fit, Gmail, Calendar, Drive, Tasks, YouTube, Photos, Contacts - pełna integracja",
    icon: "🌐",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        // Fit
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
        "https://www.googleapis.com/auth/fitness.body.read",
        // Workspace
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/tasks",
        "https://www.googleapis.com/auth/contacts.readonly",
        // YouTube
        "https://www.googleapis.com/auth/youtube.readonly",
        // Photos
        "https://www.googleapis.com/auth/photoslibrary.readonly",
      ],
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://www.googleapis.com",
      rateLimit: { requests: 100, period: "second" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: [
        "steps",
        "sleep",
        "heart_rate",
        "calories",
        "emails",
        "events",
        "files",
        "tasks",
        "contacts",
        "youtube",
        "photos",
      ],
    },
  },

  oura: {
    slug: "oura" as const,
    name: "Oura Ring",
    description: "Sleep, HRV, readiness, and activity data",
    icon: "💍",
    category: "health" as const,
    oauth: {
      authUrl: "https://cloud.ouraring.com/oauth/authorize",
      tokenUrl: "https://api.ouraring.com/oauth/token",
      scopes: ["daily", "heartrate", "workout", "tag", "session"],
      clientIdEnv: "OURA_CLIENT_ID",
      clientSecretEnv: "OURA_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://api.ouraring.com/v2",
      rateLimit: { requests: 1000, period: "day" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: ["sleep", "activity", "readiness", "heart_rate"],
    },
  },

  fitbit: {
    slug: "fitbit" as const,
    name: "Fitbit",
    description: "Steps, sleep, heart rate from Fitbit devices",
    icon: "⌚",
    category: "health" as const,
    oauth: {
      authUrl: "https://www.fitbit.com/oauth2/authorize",
      tokenUrl: "https://api.fitbit.com/oauth2/token",
      scopes: ["activity", "heartrate", "sleep", "profile"],
      clientIdEnv: "FITBIT_CLIENT_ID",
      clientSecretEnv: "FITBIT_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://api.fitbit.com/1/user/-",
      rateLimit: { requests: 150, period: "hour" as const },
    },
    sync: {
      frequency: "daily" as const,
      dataTypes: ["sleep", "activity", "heart_rate"],
    },
  },

  "google-calendar": {
    slug: "google-calendar" as const,
    name: "Google Calendar",
    description: "Events, free/busy, and reminders",
    icon: "📅",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://www.googleapis.com/calendar/v3",
      rateLimit: { requests: 100, period: "second" as const },
    },
    sync: {
      frequency: "realtime" as const,
      dataTypes: ["events", "free_busy"],
    },
  },

  notion: {
    slug: "notion" as const,
    name: "Notion",
    description: "Databases, pages, and notes",
    icon: "📓",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      clientIdEnv: "NOTION_CLIENT_ID",
      clientSecretEnv: "NOTION_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://api.notion.com/v1",
      rateLimit: { requests: 3, period: "second" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: ["databases", "pages"],
    },
  },

  todoist: {
    slug: "todoist" as const,
    name: "Todoist",
    description: "Tasks and projects",
    icon: "✅",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://todoist.com/oauth/authorize",
      tokenUrl: "https://todoist.com/oauth/access_token",
      scopes: ["data:read_write"],
      clientIdEnv: "TODOIST_CLIENT_ID",
      clientSecretEnv: "TODOIST_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://api.todoist.com/rest/v2",
      rateLimit: { requests: 450, period: "minute" as const },
    },
    sync: {
      frequency: "realtime" as const,
      dataTypes: ["tasks", "projects"],
    },
  },

  "philips-hue": {
    slug: "philips-hue" as const,
    name: "Philips Hue",
    description: "Control lights and scenes",
    icon: "💡",
    category: "smart_home" as const,
    oauth: {
      authUrl: "https://api.meethue.com/v2/oauth2/authorize",
      tokenUrl: "https://api.meethue.com/v2/oauth2/token",
      scopes: [],
      clientIdEnv: "HUE_CLIENT_ID",
      clientSecretEnv: "HUE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://api.meethue.com/route",
      rateLimit: { requests: 10, period: "second" as const },
    },
    sync: {
      frequency: "realtime" as const,
      dataTypes: ["lights", "scenes", "rooms"],
    },
  },

  plaid: {
    slug: "plaid" as const,
    name: "Plaid",
    description: "Bank transactions and balances (read-only)",
    icon: "🏦",
    category: "finance" as const,
    oauth: {
      authUrl: "", // Plaid uses Link, not standard OAuth
      tokenUrl: "https://production.plaid.com/item/public_token/exchange",
      scopes: ["transactions"],
      clientIdEnv: "PLAID_CLIENT_ID",
      clientSecretEnv: "PLAID_SECRET",
    },
    api: {
      baseUrl: "https://production.plaid.com",
      rateLimit: { requests: 100, period: "minute" as const },
    },
    sync: {
      frequency: "daily" as const,
      dataTypes: ["transactions", "balances"],
    },
  },

  "google-fit": {
    slug: "google-fit" as const,
    name: "Google Fit / HealthConnect",
    description: "Steps, sleep, heart rate, workouts from Android",
    icon: "🏃",
    category: "health" as const,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
        "https://www.googleapis.com/auth/fitness.body.read",
      ],
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://www.googleapis.com/fitness/v1/users/me",
      rateLimit: { requests: 100, period: "minute" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: ["steps", "sleep", "heart_rate", "calories", "distance"],
    },
  },

  "google-workspace": {
    slug: "google-workspace" as const,
    name: "Google Workspace",
    description: "Gmail, Calendar, Drive - full Google integration",
    icon: "🔷",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://www.googleapis.com",
      rateLimit: { requests: 100, period: "second" as const },
    },
    sync: {
      frequency: "realtime" as const,
      dataTypes: ["emails", "events", "files"],
    },
  },

  "microsoft-365": {
    slug: "microsoft-365" as const,
    name: "Microsoft 365",
    description: "Outlook, Calendar, OneDrive, Teams",
    icon: "🟦",
    category: "productivity" as const,
    oauth: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: [
        "Mail.Read",
        "Mail.Send",
        "Calendars.Read",
        "Calendars.ReadWrite",
        "Files.Read",
        "User.Read",
        "offline_access",
      ],
      clientIdEnv: "MICROSOFT_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    },
    api: {
      baseUrl: "https://graph.microsoft.com/v1.0",
      rateLimit: { requests: 10000, period: "minute" as const },
    },
    sync: {
      frequency: "realtime" as const,
      dataTypes: ["emails", "events", "files"],
    },
  },

  "health-connect": {
    slug: "health-connect" as const,
    name: "Health Connect",
    description: "Android Health Connect - sen, kroki, puls, HRV",
    icon: "❤️",
    category: "health" as const,
    // No OAuth - data pushed from Android bridge app
    oauth: undefined,
    api: {
      baseUrl: "", // No external API - data comes from device
      rateLimit: { requests: 1000, period: "hour" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: [
        "steps",
        "sleep",
        "heart_rate",
        "hrv",
        "calories",
        "distance",
      ],
    },
  },

  // =====================================================
  // FACEBOOK / META
  // =====================================================
  facebook: {
    slug: "facebook" as const,
    name: "Facebook",
    description: "Profil, posty, zdjęcia, znajomi, strony + Instagram",
    icon: "📘",
    category: "social" as const,
    oauth: {
      authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      scopes: [
        "email",
        "public_profile",
        "user_posts",
        "user_photos",
        "user_friends",
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
      ],
      clientIdEnv: "FACEBOOK_APP_ID",
      clientSecretEnv: "FACEBOOK_APP_SECRET",
    },
    api: {
      baseUrl: "https://graph.facebook.com/v21.0",
      rateLimit: { requests: 200, period: "hour" as const },
    },
    sync: {
      frequency: "daily" as const,
      dataTypes: [
        "profile",
        "posts",
        "photos",
        "friends",
        "pages",
        "instagram",
      ],
    },
  },

  // =====================================================
  // APPLE
  // =====================================================
  apple: {
    slug: "apple" as const,
    name: "Apple",
    description: "Sign in with Apple + Apple Health (wymaga iOS bridge)",
    icon: "🍎",
    category: "health" as const,
    oauth: {
      authUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      scopes: ["name", "email"],
      clientIdEnv: "APPLE_CLIENT_ID",
      clientSecretEnv: "APPLE_CLIENT_SECRET",
    },
    api: {
      baseUrl: "", // No data API - health data pushed from iOS bridge
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: [
        "steps",
        "sleep",
        "heart_rate",
        "hrv",
        "calories",
        "distance",
      ],
    },
  },

  // =====================================================
  // APPLE HEALTH (iOS Bridge - no OAuth)
  // =====================================================
  "apple-health": {
    slug: "apple-health" as const,
    name: "Apple Health",
    description: "iOS HealthKit - sen, kroki, puls, HRV (wymaga iOS bridge)",
    icon: "🍏",
    category: "health" as const,
    oauth: undefined, // Data pushed from iOS bridge app
    api: {
      baseUrl: "", // No external API - data comes from device
      rateLimit: { requests: 1000, period: "hour" as const },
    },
    sync: {
      frequency: "hourly" as const,
      dataTypes: [
        "steps",
        "sleep",
        "heart_rate",
        "hrv",
        "calories",
        "distance",
      ],
    },
  },
} as const;

export type RigSlugKey = keyof typeof RIG_DEFINITIONS;

// Get rig definition by slug
export function getRigDefinition(slug: string) {
  return RIG_DEFINITIONS[slug as RigSlugKey];
}

// Get all rig slugs
export function getAllRigSlugs(): string[] {
  return Object.keys(RIG_DEFINITIONS);
}
