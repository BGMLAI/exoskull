/**
 * Emotion Intelligence Types — Layer 11 (ARCHITECTURE.md)
 *
 * Phase 1: Text-based emotion detection + crisis detection
 * Phase 2: Voice prosody + facial analysis (VoiceFeatures, FaceData populated)
 */

// ============================================================================
// EMOTION STATE (Fusion Output)
// ============================================================================

export type PrimaryEmotion =
  | "happy"
  | "sad"
  | "angry"
  | "fearful"
  | "disgusted"
  | "surprised"
  | "neutral";

export interface EmotionState {
  primary_emotion: PrimaryEmotion;
  intensity: number; // 0-100
  secondary_emotions: string[];

  // Dimensional model (Russell's VAD circumplex)
  valence: number; // -1 (negative) to +1 (positive)
  arousal: number; // 0 (calm) to 1 (excited)
  dominance: number; // 0 (submissive) to 1 (dominant)

  confidence: number; // 0-1
  source: "text_hf" | "text_keywords" | "text_ai" | "voice" | "fusion";

  raw_data?: {
    text_sentiment?: TextSentiment;
    voice_features?: VoiceFeatures | null;
    face_detected?: FaceData | null;
  };
}

// ============================================================================
// TEXT SENTIMENT
// ============================================================================

export interface TextSentiment {
  emotions: Array<{ label: string; score: number }>;
  keywords_matched: string[];
  language: "pl" | "en" | "unknown";
  crisis_keywords_matched: string[];
}

// ============================================================================
// VOICE & FACE (Phase 2 placeholders)
// ============================================================================

export interface VoiceFeatures {
  pitch_mean: number;
  pitch_variance: number;
  speech_rate: number; // words per minute
  energy: number; // 0-1
  pause_frequency: number;
  pause_duration_avg: number;
  jitter?: number;
  shimmer?: number;
}

export interface FaceData {
  emotions: Record<string, number>;
  confidence: number;
  timestamp: string;
}

// ============================================================================
// CRISIS DETECTION
// ============================================================================

export type CrisisType = "suicide" | "panic" | "trauma" | "substance";
export type CrisisSeverity = "low" | "medium" | "high" | "critical";

export interface CrisisAssessment {
  detected: boolean;
  type?: CrisisType;
  severity?: CrisisSeverity;
  indicators: string[];
  confidence: number; // 0-1
  protocol: CrisisProtocol | null;
}

export interface CrisisProtocol {
  type: CrisisType;
  steps: string[];
  hotlines: Array<{ name: string; number: string }>;
  escalate_to_human: boolean;
  stay_engaged: boolean;
  prompt_override: string;
}

// ============================================================================
// ADAPTIVE RESPONSE
// ============================================================================

export type ResponseMode =
  | "high_sadness"
  | "high_anger"
  | "anxiety"
  | "low_energy"
  | "mixed_signals"
  | "neutral";

export interface AdaptivePrompt {
  mode: ResponseMode;
  instruction: string;
  tone_hints: string[];
}

// ============================================================================
// DATABASE LOG ENTRY
// ============================================================================

export interface EmotionLogEntry {
  tenant_id: string;
  session_id?: string;
  primary_emotion: string;
  intensity: number;
  secondary_emotions: string[];
  valence: number;
  arousal: number;
  dominance: number;
  fusion_confidence: number;
  text_sentiment: TextSentiment;
  voice_features: VoiceFeatures | null;
  face_detected: FaceData | null;
  crisis_flags: string[];
  crisis_protocol_triggered: boolean;
  escalated_to_human: boolean;
  personality_adapted_to: string | null;
  message_text: string;
}
