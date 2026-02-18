/**
 * App Suggestion Dedup Tracker
 *
 * In-memory tracker to prevent spamming the same integration suggestion
 * within a conversation window. Uses 1-hour TTL per tenant+slug pair.
 */

const SUGGESTION_TTL_MS = 60 * 60 * 1000; // 1 hour

interface SuggestionEntry {
  slugs: Map<string, number>; // slug → timestamp
}

const suggestions = new Map<string, SuggestionEntry>();

/**
 * Check if an app has already been suggested to this tenant recently.
 */
export function hasBeenSuggested(tenantId: string, slug: string): boolean {
  const entry = suggestions.get(tenantId);
  if (!entry) return false;

  const ts = entry.slugs.get(slug);
  if (!ts) return false;

  // Expired?
  if (Date.now() - ts > SUGGESTION_TTL_MS) {
    entry.slugs.delete(slug);
    return false;
  }

  return true;
}

/**
 * Mark an app as suggested for this tenant (with TTL).
 */
export function markAsSuggested(tenantId: string, slug: string): void {
  let entry = suggestions.get(tenantId);
  if (!entry) {
    entry = { slugs: new Map() };
    suggestions.set(tenantId, entry);
  }
  entry.slugs.set(slug, Date.now());
}

/**
 * Cleanup expired entries. Called periodically to prevent memory leaks.
 */
function cleanup(): void {
  const now = Date.now();
  for (const [tenantId, entry] of suggestions) {
    for (const [slug, ts] of entry.slugs) {
      if (now - ts > SUGGESTION_TTL_MS) {
        entry.slugs.delete(slug);
      }
    }
    if (entry.slugs.size === 0) {
      suggestions.delete(tenantId);
    }
  }
}

// Run cleanup every 30 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanup, 30 * 60 * 1000).unref?.();
}
