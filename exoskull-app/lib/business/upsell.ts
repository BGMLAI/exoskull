// ============================================================================
// Upsell Logic - Detect when user should upgrade
// ============================================================================

import {
  TIER_LIMITS,
  type SubscriptionTier,
  type UpsellSuggestion,
  type UsageSummary,
} from "./types";

const UPSELL_THRESHOLD = 0.8; // 80% of limit

const TIER_ORDER: SubscriptionTier[] = [
  "free",
  "basic",
  "pro",
  "business",
  "enterprise",
];

const TIER_PRICES: Record<SubscriptionTier, number> = {
  free: 0,
  basic: 49,
  pro: 149,
  business: 499,
  enterprise: 0, // Custom
};

/**
 * Check if user should be suggested an upgrade based on usage patterns.
 */
export function shouldSuggestUpgrade(
  usage: UsageSummary,
  tier: SubscriptionTier,
): UpsellSuggestion | null {
  const limits = TIER_LIMITS[tier];
  if (!limits) return null;

  const currentIndex = TIER_ORDER.indexOf(tier);
  if (currentIndex >= TIER_ORDER.length - 1) return null; // Already on highest

  const suggestedTier = TIER_ORDER[currentIndex + 1];

  // Check each resource
  const checks: Array<{ resource: string; current: number; limit: number }> = [
    {
      resource: "conversations",
      current: usage.conversations_count,
      limit: limits.conversations_daily,
    },
    {
      resource: "ai_requests",
      current: usage.ai_requests_count,
      limit: limits.ai_requests_daily,
    },
    {
      resource: "voice_minutes",
      current: usage.voice_minutes,
      limit: limits.voice_minutes_daily,
    },
  ];

  for (const check of checks) {
    if (check.limit === -1) continue; // Unlimited

    const usagePercent = check.current / check.limit;

    if (usagePercent >= UPSELL_THRESHOLD) {
      const resourceLabels: Record<string, string> = {
        conversations: "rozmow",
        ai_requests: "zapytan AI",
        voice_minutes: "minut glosowych",
      };

      return {
        currentTier: tier,
        suggestedTier,
        resource: check.resource,
        usagePercent: Math.round(usagePercent * 100),
        reason: `Uzywasz ${Math.round(usagePercent * 100)}% dziennego limitu ${resourceLabels[check.resource] || check.resource}. Plan ${suggestedTier} (${TIER_PRICES[suggestedTier]} PLN/mies.) daje ${TIER_LIMITS[suggestedTier][checks.indexOf(check) === 0 ? "conversations_daily" : checks.indexOf(check) === 1 ? "ai_requests_daily" : "voice_minutes_daily"] === -1 ? "nieograniczoną liczbę" : "wyższy limit"}.`,
      };
    }
  }

  return null;
}
