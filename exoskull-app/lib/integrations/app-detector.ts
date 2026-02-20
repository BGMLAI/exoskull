/**
 * App Mention Detector — zero-cost keyword matching for user messages.
 *
 * Scans text for app/service mentions (Polish + English variants with declinations)
 * and returns connector slugs for proactive integration proposals.
 *
 * Performance: <1ms, no AI call, pure string matching.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AppMapping {
  displayName: string;
  connectorSlug: string;
  connectorType: "rig";
  connectToolName: "connect_rig";
  category:
    | "productivity"
    | "health"
    | "social"
    | "finance"
    | "smart_home"
    | "communication"
    | "dev";
}

// ============================================================================
// APP CATALOG — keywords → connector mapping
// ============================================================================

/**
 * Map of lowercase keywords (PL + EN, including Polish declinations) to AppMapping.
 * Multiple keywords can map to the same connector slug.
 */
const APP_CATALOG = new Map<string, AppMapping>();

function register(keywords: string[], mapping: AppMapping): void {
  for (const kw of keywords) {
    APP_CATALOG.set(kw.toLowerCase(), mapping);
  }
}

// ── Productivity ──

register(
  [
    "notion",
    "notionie",
    "notiona",
    "notionem",
    "w notion",
    "z notion",
    "do notion",
  ],
  {
    displayName: "Notion",
    connectorSlug: "notion",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "productivity",
  },
);

register(
  [
    "todoist",
    "todoiscie",
    "todoista",
    "todoistem",
    "w todoist",
    "z todoist",
    "do todoist",
  ],
  {
    displayName: "Todoist",
    connectorSlug: "todoist",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "productivity",
  },
);

// ── Google Suite ──

register(
  [
    "google calendar",
    "kalendarz google",
    "kalendarza google",
    "kalendarzu google",
    "gcal",
    "google cal",
    "kalendarz google'a",
  ],
  {
    displayName: "Google Calendar",
    connectorSlug: "google-calendar",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "productivity",
  },
);

register(["google fit", "google ficie", "google fita", "googlefit"], {
  displayName: "Google Fit",
  connectorSlug: "google-fit",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "health",
});

register(
  [
    "google drive",
    "dysk google",
    "dysku google",
    "google'owym dysku",
    "na drive",
    "z drive'a",
    "gdrive",
  ],
  {
    displayName: "Google Drive",
    connectorSlug: "google-drive",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "productivity",
  },
);

register(
  ["arkusz", "arkusze", "arkuszu", "google sheets", "sheets", "spreadsheet"],
  {
    displayName: "Google Sheets",
    connectorSlug: "google-sheets",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "productivity",
  },
);

// ── Email ──

register(
  [
    "gmail",
    "gmaila",
    "gmailu",
    "gmailem",
    "na gmailu",
    "z gmaila",
    "google mail",
  ],
  {
    displayName: "Gmail",
    connectorSlug: "gmail",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "communication",
  },
);

register(
  ["outlook", "outlooka", "outlooku", "outlookiem", "na outlooku", "hotmail"],
  {
    displayName: "Outlook",
    connectorSlug: "microsoft-365",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "communication",
  },
);

// ── Microsoft ──

register(["excel", "excelu", "excela", "excelem", "w excelu", "arkusz excel"], {
  displayName: "Microsoft 365",
  connectorSlug: "microsoft-365",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "productivity",
});

register(["teams", "teamsie", "teamsy", "microsoft teams", "ms teams"], {
  displayName: "Microsoft Teams",
  connectorSlug: "microsoft-365",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "communication",
});

// ── Communication ──

register(
  [
    "slack",
    "slacku",
    "slacka",
    "slackiem",
    "na slacku",
    "ze slacka",
    "w slack",
  ],
  {
    displayName: "Slack",
    connectorSlug: "slack",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "communication",
  },
);

// ── Dev ──

register(
  [
    "github",
    "githubie",
    "githuba",
    "githubem",
    "na githubie",
    "z githuba",
    "gh",
  ],
  {
    displayName: "GitHub",
    connectorSlug: "github",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "dev",
  },
);

// ── Health ──

register(
  ["oura", "oury", "ourą", "oura ring", "pierścień oura", "pierscien oura"],
  {
    displayName: "Oura",
    connectorSlug: "oura",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "health",
  },
);

register(["fitbit", "fitbita", "fitbitem", "fitbicie", "z fitbita"], {
  displayName: "Fitbit",
  connectorSlug: "fitbit",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "health",
});

register(
  [
    "apple health",
    "apple healtha",
    "apple watch",
    "apple watcha",
    "watchem",
    "zegarek apple",
    "zegarka apple",
  ],
  {
    displayName: "Apple Health",
    connectorSlug: "apple-health",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "health",
  },
);

register(["strava", "stravie", "stravy", "stravą", "na stravie", "ze stravy"], {
  displayName: "Strava",
  connectorSlug: "strava",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "health",
});

// ── Social ──

register(["spotify", "spotifaju", "spotify'a", "spotifaya", "na spotify"], {
  displayName: "Spotify",
  connectorSlug: "spotify",
  connectorType: "rig",
  connectToolName: "connect_rig",
  category: "social",
});

register(
  ["facebook", "facebooku", "facebooka", "facebookiem", "na facebooku", "fb"],
  {
    displayName: "Facebook",
    connectorSlug: "facebook",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "social",
  },
);

register(
  [
    "instagram",
    "instagramie",
    "instagrama",
    "instagramem",
    "na instagramie",
    "insta",
    "ig",
  ],
  {
    displayName: "Instagram",
    connectorSlug: "instagram",
    connectorType: "rig",
    connectToolName: "connect_rig",
    category: "social",
  },
);

// ── Finance ──

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Detect app mentions in user text. Returns unique connector slugs.
 * Uses word-boundary-aware matching to avoid false positives.
 *
 * @example detectAppMentions("zapisałem to w Notionie") → ["notion"]
 * @example detectAppMentions("sprawdź Gmail i Todoist") → ["gmail", "todoist"]
 */
export function detectAppMentions(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const [keyword, mapping] of APP_CATALOG) {
    // For multi-word keywords, use includes
    // For single-word keywords, use word boundary check
    if (keyword.includes(" ")) {
      if (lower.includes(keyword)) {
        found.add(mapping.connectorSlug);
      }
    } else {
      // Word boundary: check that chars before/after are not alphanumeric
      const idx = lower.indexOf(keyword);
      if (idx === -1) continue;

      const before = idx > 0 ? lower[idx - 1] : " ";
      const after =
        idx + keyword.length < lower.length ? lower[idx + keyword.length] : " ";

      const isWordBoundaryBefore = !/[a-ząćęłńóśźż0-9]/.test(before);
      const isWordBoundaryAfter = !/[a-ząćęłńóśźż0-9]/.test(after);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        found.add(mapping.connectorSlug);
      }
    }
  }

  return [...found];
}

/**
 * Get the full AppMapping for a connector slug.
 * Searches the catalog by connectorSlug (not keyword).
 */
export function getAppMapping(slug: string): AppMapping | undefined {
  for (const mapping of APP_CATALOG.values()) {
    if (mapping.connectorSlug === slug) return mapping;
  }
  return undefined;
}

/**
 * Get all unique connector slugs in the catalog.
 */
export function getAllConnectorSlugs(): string[] {
  const slugs = new Set<string>();
  for (const mapping of APP_CATALOG.values()) {
    slugs.add(mapping.connectorSlug);
  }
  return [...slugs];
}
