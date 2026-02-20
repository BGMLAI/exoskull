/**
 * App Context Builder — generates system prompt fragments for detected apps.
 *
 * When a user mentions an app that isn't connected, this builder creates
 * a context fragment instructing the AI to naturally propose connecting it.
 */

import { detectAppMentions, getAppMapping } from "./app-detector";
import type { AppMapping } from "./app-detector";
import { hasBeenSuggested, markAsSuggested } from "./app-suggestion-tracker";

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedApp {
  slug: string;
  mapping: AppMapping;
  alreadyConnected: boolean;
}

export interface AppDetectionResult {
  contextFragment: string;
  detectedApps: DetectedApp[];
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Detect app mentions in user message and build a context fragment
 * for unconnected apps. Skips already-connected and recently-suggested apps.
 *
 * @param tenantId - User tenant ID
 * @param userMessage - The raw user message text
 * @param rigConnections - Active rig connections from exo_rig_connections
 * @param composioConnections - Active Composio connections
 * @returns Context fragment + list of detected apps
 */
export function buildAppDetectionContext(
  tenantId: string,
  userMessage: string,
  rigConnections: Array<{ rig_slug: string; sync_status: string }>,
  _composioConnections?: Array<{ toolkit: string; status: string }>,
): AppDetectionResult {
  const detectedSlugs = detectAppMentions(userMessage);

  if (detectedSlugs.length === 0) {
    return { contextFragment: "", detectedApps: [] };
  }

  // Build set of already-connected rig slugs for fast lookup
  const connectedRigs = new Set(
    rigConnections
      .filter((r) => r.sync_status === "active" || r.sync_status === "synced")
      .map((r) => r.rig_slug),
  );

  const detectedApps: DetectedApp[] = [];
  const unconnectedApps: Array<{ mapping: AppMapping; slug: string }> = [];

  for (const slug of detectedSlugs) {
    const mapping = getAppMapping(slug);
    if (!mapping) continue;

    // Only rig-type connectors are supported now
    if (mapping.connectorType !== "rig") continue;

    const isConnected = connectedRigs.has(slug);

    detectedApps.push({ slug, mapping, alreadyConnected: isConnected });

    if (!isConnected && !hasBeenSuggested(tenantId, slug)) {
      unconnectedApps.push({ mapping, slug });
      markAsSuggested(tenantId, slug);
    }
  }

  if (unconnectedApps.length === 0) {
    return { contextFragment: "", detectedApps };
  }

  // Build context fragment
  const appLines = unconnectedApps.map((a) => {
    return `- ${a.mapping.displayName} — użyj narzędzia connect_rig z rig_slug="${a.slug}"`;
  });

  const contextFragment = [
    "",
    "## WYKRYTE APLIKACJE (auto-detekcja)",
    "Użytkownik wspomniał o aplikacjach, które NIE SĄ jeszcze podłączone:",
    ...appLines,
    "→ NATURALNIE zaproponuj połączenie (1-2 zdania, nie naciskaj).",
    "→ Jeśli user odmówi, uszanuj to. NIE wspominaj ponownie.",
  ].join("\n");

  return { contextFragment, detectedApps };
}
