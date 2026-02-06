/**
 * IORS Emotion Matrix — Tau 4-Quadrant Classification
 *
 * Maps Russell's Valence-Arousal circumplex model to Tau's 4 quadrants:
 *
 * |           | Chce (want)     | Nie chce (unwant) |
 * |-----------|-----------------|-------------------|
 * | Znane     | known_want      | known_unwant      |
 * | Nieznane  | unknown_want    | unknown_unwant    |
 *
 * + subcriticality (0-1): intensity/volatility of the emotion.
 * High subcriticality = near "edge of chaos" = volatile, transformative.
 * Low subcriticality = stable, calm, closer to equilibrium.
 *
 * Integration: Fire-and-forget after each analyzeEmotion() call.
 * Does NOT affect response generation — purely observational logging.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { EmotionSignal, TauQuadrant } from "./types";

// ============================================================================
// QUADRANT CLASSIFICATION
// ============================================================================

/**
 * Classify emotion state from VAD (Valence-Arousal-Dominance) model
 * into Tau 4-quadrant system.
 *
 * @param emotionState - Output from analyzeEmotion() (lib/emotion/)
 * @returns EmotionSignal with Tau quadrant classification
 */
export function classifyTauQuadrant(emotionState: {
  valence?: number;
  arousal?: number;
  primary_emotion?: string;
  confidence?: number;
  source?: string;
}): EmotionSignal {
  const valence = emotionState.valence ?? 0;
  const arousal = emotionState.arousal ?? 0.5;
  const label = emotionState.primary_emotion ?? "neutral";
  const confidence = emotionState.confidence ?? 0.5;

  let quadrant: TauQuadrant;
  let subcriticality: number;

  if (valence > 0.1 && arousal > 0.4) {
    // Positive + activated: joy, excitement, desire
    quadrant = "known_want";
    subcriticality = Math.min(1, (arousal + valence) / 2);
  } else if (valence < -0.1 && arousal > 0.4) {
    // Negative + activated: anger, fear, frustration
    quadrant = "known_unwant";
    subcriticality = Math.min(1, (arousal + Math.abs(valence)) / 2);
  } else if (valence >= -0.1 && arousal <= 0.4) {
    // Neutral/positive + calm: curiosity, contentment, serenity
    quadrant = "unknown_want";
    subcriticality = Math.max(0, 1 - arousal); // Low arousal = latent potential
  } else {
    // Negative + calm: apathy, numbness, resignation
    quadrant = "unknown_unwant";
    subcriticality = Math.min(1, (Math.abs(valence) + (1 - arousal)) / 2);
  }

  return {
    quadrant,
    subcriticality,
    valence,
    arousal,
    label,
    confidence,
    source: (emotionState.source as EmotionSignal["source"]) || "text",
  };
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log an emotion signal to the exo_emotion_signals table.
 * Fire-and-forget — errors are logged but do not propagate.
 */
export async function logEmotionSignal(
  tenantId: string,
  signal: EmotionSignal,
  sessionId?: string,
  messageId?: string,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();

    const { error } = await supabase.from("exo_emotion_signals").insert({
      tenant_id: tenantId,
      session_id: sessionId || null,
      message_id: messageId || null,
      quadrant: signal.quadrant,
      subcriticality: signal.subcriticality,
      valence: signal.valence,
      arousal: signal.arousal,
      label: signal.label,
      confidence: signal.confidence,
      source: signal.source,
      context: signal.context || {},
    });

    if (error) {
      console.error("[EmotionMatrix] Failed to log signal:", {
        tenantId,
        error: error.message,
      });
    }
  } catch (err) {
    console.error("[EmotionMatrix] logEmotionSignal exception:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Get emotion trend for a tenant over the last N days.
 * Used by loop system for proactive interventions.
 */
export async function getEmotionTrend(
  tenantId: string,
  days: number = 7,
): Promise<{
  quadrant_distribution: Record<TauQuadrant, number>;
  avg_valence: number;
  avg_arousal: number;
  avg_subcriticality: number;
  total_signals: number;
}> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("exo_emotion_signals")
    .select("quadrant, valence, arousal, subcriticality")
    .eq("tenant_id", tenantId)
    .gte("created_at", since);

  if (error || !data || data.length === 0) {
    return {
      quadrant_distribution: {
        known_want: 0,
        known_unwant: 0,
        unknown_want: 0,
        unknown_unwant: 0,
      },
      avg_valence: 0,
      avg_arousal: 0.5,
      avg_subcriticality: 0.5,
      total_signals: 0,
    };
  }

  const total = data.length;
  const distribution: Record<TauQuadrant, number> = {
    known_want: 0,
    known_unwant: 0,
    unknown_want: 0,
    unknown_unwant: 0,
  };

  let sumValence = 0;
  let sumArousal = 0;
  let sumSubcriticality = 0;

  for (const row of data) {
    distribution[row.quadrant as TauQuadrant]++;
    sumValence += row.valence;
    sumArousal += row.arousal;
    sumSubcriticality += row.subcriticality;
  }

  // Normalize distribution to percentages
  for (const key of Object.keys(distribution) as TauQuadrant[]) {
    distribution[key] = Math.round((distribution[key] / total) * 100);
  }

  return {
    quadrant_distribution: distribution,
    avg_valence: sumValence / total,
    avg_arousal: sumArousal / total,
    avg_subcriticality: sumSubcriticality / total,
    total_signals: total,
  };
}
