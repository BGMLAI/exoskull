/**
 * BGML Framework Selector
 *
 * Queries bgml_frameworks table and selects the best reasoning framework
 * for a given domain. Caches results in-memory (5 min TTL).
 */

import type { BGMLDomain } from "./classifier";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export interface BGMLFramework {
  id: string;
  name: string;
  slug: string;
  domain: string;
  description: string;
  prompt_template: string;
  quality_score: number;
  example_questions: string[];
}

// ── In-memory cache ──
let _cache: BGMLFramework[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadFrameworks(): Promise<BGMLFramework[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("bgml_frameworks")
      .select("*")
      .order("quality_score", { ascending: false });

    if (error) {
      logger.error("[BGML:FrameworkSelector] Load failed:", {
        error: error.message,
      });
      return _cache || [];
    }

    _cache = (data as BGMLFramework[]) || [];
    _cacheTime = now;
    return _cache;
  } catch (err) {
    logger.error("[BGML:FrameworkSelector] Exception:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return _cache || [];
  }
}

/**
 * Select best framework for a domain.
 * Falls back to "general" domain frameworks if no exact match.
 * Returns null if no frameworks are available.
 */
export async function selectFramework(
  domain: BGMLDomain,
): Promise<BGMLFramework | null> {
  const frameworks = await loadFrameworks();
  if (frameworks.length === 0) return null;

  // Exact domain match — best quality score
  const domainMatch = frameworks.find((f) => f.domain === domain);
  if (domainMatch) return domainMatch;

  // Fallback: general domain
  const generalMatch = frameworks.find((f) => f.domain === "general");
  if (generalMatch) return generalMatch;

  // Ultimate fallback: highest quality score
  return frameworks[0] || null;
}

/**
 * Get all available frameworks (for listing/selection UI).
 */
export async function listFrameworks(): Promise<BGMLFramework[]> {
  return loadFrameworks();
}

/**
 * Get framework by slug.
 */
export async function getFrameworkBySlug(
  slug: string,
): Promise<BGMLFramework | null> {
  const frameworks = await loadFrameworks();
  return frameworks.find((f) => f.slug === slug) || null;
}
