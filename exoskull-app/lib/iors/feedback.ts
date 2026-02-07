/**
 * IORS Feedback Capture System
 *
 * Collects user feedback on IORS responses, autonomous actions,
 * and overall behavior. Feeds into the optimization loop.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export type FeedbackType =
  | "response_quality"
  | "personality"
  | "action"
  | "feature_request"
  | "bug_report"
  | "general";

export interface FeedbackInput {
  type: FeedbackType;
  rating?: number; // 1-5
  message?: string;
  context?: Record<string, unknown>;
  channel?: string;
}

export interface FeedbackSummary {
  total: number;
  avgRating: number;
  positive: number;
  negative: number;
  byType: Record<string, { count: number; avgRating: number }>;
}

// ============================================================================
// SUBMIT FEEDBACK
// ============================================================================

export async function submitFeedback(
  tenantId: string,
  input: FeedbackInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Clamp rating to 1-5
  const rating = input.rating
    ? Math.max(1, Math.min(5, Math.round(input.rating)))
    : null;

  const { data, error } = await supabase
    .from("exo_feedback")
    .insert({
      tenant_id: tenantId,
      feedback_type: input.type,
      rating,
      message: input.message || null,
      context: input.context || {},
      channel: input.channel || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Feedback] submitFeedback failed:", {
      tenantId,
      type: input.type,
      error: error.message,
    });
    return { success: false, error: error.message };
  }

  logger.info("[Feedback] Submitted:", {
    tenantId,
    type: input.type,
    rating,
    id: data.id,
  });

  return { success: true, id: data.id };
}

// ============================================================================
// GET SUMMARY
// ============================================================================

/**
 * Get feedback summary for a tenant (last N days).
 */
export async function getFeedbackSummary(
  tenantId: string,
  days: number = 30,
): Promise<FeedbackSummary> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("exo_feedback")
    .select("feedback_type, rating")
    .eq("tenant_id", tenantId)
    .gte("created_at", since);

  if (error || !data) {
    console.error("[Feedback] getFeedbackSummary failed:", {
      tenantId,
      error: error?.message,
    });
    return { total: 0, avgRating: 0, positive: 0, negative: 0, byType: {} };
  }

  const total = data.length;
  const rated = data.filter((f) => f.rating != null);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length
      : 0;
  const positive = rated.filter((f) => (f.rating || 0) >= 4).length;
  const negative = rated.filter((f) => (f.rating || 0) <= 2).length;

  // Group by type
  const byType: Record<string, { count: number; avgRating: number }> = {};
  for (const f of data) {
    if (!byType[f.feedback_type]) {
      byType[f.feedback_type] = { count: 0, avgRating: 0 };
    }
    byType[f.feedback_type].count++;
  }
  // Calculate per-type avg
  for (const type of Object.keys(byType)) {
    const typeRated = data.filter(
      (f) => f.feedback_type === type && f.rating != null,
    );
    byType[type].avgRating =
      typeRated.length > 0
        ? typeRated.reduce((s, f) => s + (f.rating || 0), 0) / typeRated.length
        : 0;
  }

  return {
    total,
    avgRating: Math.round(avgRating * 10) / 10,
    positive,
    negative,
    byType,
  };
}

// ============================================================================
// RECENT FEEDBACK
// ============================================================================

export async function getRecentFeedback(
  tenantId: string,
  limit: number = 20,
): Promise<
  Array<{
    id: string;
    type: string;
    rating: number | null;
    message: string | null;
    created_at: string;
  }>
> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_feedback")
    .select("id, feedback_type, rating, message, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Feedback] getRecentFeedback failed:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  return (data || []).map((f) => ({
    id: f.id,
    type: f.feedback_type,
    rating: f.rating,
    message: f.message,
    created_at: f.created_at,
  }));
}
