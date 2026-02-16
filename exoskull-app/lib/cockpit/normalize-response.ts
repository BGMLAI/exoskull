/**
 * Shared API response normalization for cockpit HUD panels.
 * Extracted from components/3d/SpatialPanel.tsx for reuse.
 */

export interface DataItem {
  title?: string;
  name?: string;
  subject?: string;
  [key: string]: unknown;
}

export interface FetchedData {
  items?: DataItem[];
  [key: string]: unknown;
}

/** Polish label mapping for status keys */
export const LABEL_MAP: Record<string, string> = {
  pending: "Oczekujące",
  in_progress: "W toku",
  done: "Gotowe",
  cancelled: "Anulowane",
  blocked: "Zablokowane",
  unread: "Nieprzeczytane",
  urgent: "Pilne",
  needsReply: "Wymaga odpowiedzi",
  overdueFollowUps: "Przeterminowane",
  todayReceived: "Dziś otrzymane",
  total_documents: "Dokumenty",
  total_chunks: "Fragmenty",
};

/**
 * Normalizes various API response shapes into { items: DataItem[] }.
 * Handles: flat arrays, { items }, { documents }, { stats }, { summary, urgentEmails }
 */
export function normalizeResponse(raw: unknown): FetchedData {
  // Flat array (e.g. activity-feed returns [...])
  if (Array.isArray(raw)) {
    return {
      items: raw.map((entry) => ({
        title:
          entry.action_name ||
          entry.description ||
          entry.title ||
          entry.name ||
          JSON.stringify(entry).slice(0, 60),
        ...entry,
      })),
    };
  }

  const obj = raw as Record<string, unknown>;

  // Already has items array (calendar)
  if (Array.isArray(obj.items) && obj.items.length > 0) {
    return obj as FetchedData;
  }

  // Knowledge: { documents: [...] }
  if (Array.isArray(obj.documents) && obj.documents.length > 0) {
    return {
      items: obj.documents.map((doc: Record<string, unknown>) => ({
        title: (doc.filename || doc.title || doc.name || "Dokument") as string,
        name: (doc.category || "") as string,
        ...doc,
      })),
    };
  }

  // Emails: { summary: {...}, urgentEmails: [...] }
  if (obj.summary && typeof obj.summary === "object") {
    const summary = obj.summary as Record<string, unknown>;
    const urgentEmails = Array.isArray(obj.urgentEmails)
      ? obj.urgentEmails
      : [];
    if (urgentEmails.length > 0) {
      return {
        items: urgentEmails.map((e: Record<string, unknown>) => ({
          title: (e.subject || "Email") as string,
          name: (e.from_name || e.from_email || "") as string,
          ...e,
        })),
      };
    }
    return {
      items: Object.entries(summary)
        .filter(([, v]) => typeof v === "number")
        .map(([key, value]) => ({
          title: `${LABEL_MAP[key] || key}: ${value}`,
        })),
    };
  }

  // Tasks: { stats: {...} }
  if (obj.stats && typeof obj.stats === "object") {
    const stats = obj.stats as Record<string, unknown>;
    return {
      items: Object.entries(stats)
        .filter(([, v]) => typeof v === "number" || typeof v === "string")
        .map(([key, value]) => ({
          title: `${LABEL_MAP[key] || key}: ${value}`,
        })),
    };
  }

  // Values hierarchy: { values: [...] }
  if (Array.isArray(obj.values) && obj.values.length > 0) {
    return {
      items: obj.values.map((v: Record<string, unknown>) => ({
        title: (v.name || "Wartość") as string,
        name: (v.description || "") as string,
        ...v,
      })),
    };
  }

  return obj as FetchedData;
}
