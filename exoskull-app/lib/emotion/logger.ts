/**
 * Emotion Logger — Layer 11
 *
 * Persists emotion detection results to exo_emotion_log.
 * Fire-and-forget for normal emotions, synchronous for crisis events.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { EmotionState, EmotionLogEntry } from "./types";

// ============================================================================
// LOG EMOTION
// ============================================================================

/**
 * Log an emotion detection result to the database.
 * Never throws — logs errors to console instead.
 */
export async function logEmotion(
  tenantId: string,
  emotion: EmotionState,
  messageText: string,
  opts: {
    sessionId?: string;
    crisisFlags?: string[];
    crisisProtocolTriggered?: boolean;
    escalatedToHuman?: boolean;
    personalityAdaptedTo?: string;
  } = {},
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const entry: Partial<EmotionLogEntry> = {
      tenant_id: tenantId,
      session_id: opts.sessionId,
      primary_emotion: emotion.primary_emotion,
      intensity: emotion.intensity,
      secondary_emotions: emotion.secondary_emotions,
      valence: emotion.valence,
      arousal: emotion.arousal,
      dominance: emotion.dominance,
      fusion_confidence: emotion.confidence,
      text_sentiment: emotion.raw_data?.text_sentiment || {
        emotions: [],
        keywords_matched: [],
        language: "unknown",
        crisis_keywords_matched: [],
      },
      voice_features: emotion.raw_data?.voice_features || null,
      face_detected: emotion.raw_data?.face_detected || null,
      crisis_flags: opts.crisisFlags || [],
      crisis_protocol_triggered: opts.crisisProtocolTriggered || false,
      escalated_to_human: opts.escalatedToHuman || false,
      personality_adapted_to: opts.personalityAdaptedTo || null,
      message_text: messageText,
    };

    const { error } = await supabase.from("exo_emotion_log").insert(entry);

    if (error) {
      console.error("[EmotionLogger] Failed to log emotion:", {
        error: error.message,
        tenantId,
        emotion: emotion.primary_emotion,
      });
    }
  } catch (error) {
    console.error("[EmotionLogger] Unexpected error:", error);
  }
}

// ============================================================================
// GET EMOTION HISTORY
// ============================================================================

export async function getEmotionHistory(
  tenantId: string,
  limit = 50,
  options: {
    startDate?: Date;
    endDate?: Date;
    crisisOnly?: boolean;
  } = {},
): Promise<EmotionLogEntry[]> {
  try {
    const supabase = createServiceClient();

    let query = supabase
      .from("exo_emotion_log")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options.startDate) {
      query = query.gte("created_at", options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte("created_at", options.endDate.toISOString());
    }

    if (options.crisisOnly) {
      query = query.not("crisis_flags", "eq", "{}");
    }

    const { data, error } = await query;

    if (error) {
      console.error("[EmotionLogger] Failed to fetch history:", error);
      return [];
    }

    return (data as EmotionLogEntry[]) || [];
  } catch (error) {
    console.error("[EmotionLogger] Unexpected error:", error);
    return [];
  }
}
