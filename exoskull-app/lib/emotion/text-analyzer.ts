/**
 * Text Emotion Analyzer — Layer 11 Emotion Intelligence
 *
 * Multi-strategy emotion detection from text:
 * 1. Gemini Flash AI classification (cheapest, most accurate)
 * 2. HuggingFace Inference API (free tier fallback)
 * 3. Polish keyword matching (offline fallback)
 *
 * Also detects crisis keywords for the crisis-detector module.
 */

import type {
  EmotionState,
  PrimaryEmotion,
  TextSentiment,
  VoiceFeatures,
} from "./types";

// ============================================================================
// CRISIS KEYWORD LISTS
// ============================================================================

export const CRISIS_KEYWORDS: Record<string, { pl: string[]; en: string[] }> = {
  suicide: {
    pl: [
      "nie ma sensu",
      "koniec ze mną",
      "lepiej będzie jak mnie nie będzie",
      "nie ma po co żyć",
      "chcę umrzeć",
      "nie warto żyć",
      "chcę to skończyć",
      "nie chcę już żyć",
      "chcę się zabić",
      "samobójstwo",
    ],
    en: [
      "no point",
      "end it all",
      "better off dead",
      "can't go on",
      "want to die",
      "not worth living",
      "kill myself",
      "suicide",
      "no reason to live",
    ],
  },
  panic: {
    pl: [
      "nie mogę oddychać",
      "serce mi wali",
      "zaraz umrę",
      "tracę kontrolę",
      "ból w klatce",
      "atak paniki",
      "duszę się",
      "serce wyskakuje",
    ],
    en: [
      "can't breathe",
      "heart racing",
      "going to die",
      "losing control",
      "chest pain",
      "panic attack",
      "suffocating",
      "heart pounding",
    ],
  },
  trauma: {
    pl: [
      "wspomnienie wraca",
      "nie mogę przestać myśleć",
      "koszmar",
      "dysocjacja",
      "flashback",
      "nie mogę zapomnieć",
      "znowu to widzę",
      "odcinam się",
    ],
    en: [
      "flashback",
      "can't stop thinking",
      "triggered",
      "nightmare",
      "dissociating",
      "reliving it",
      "can't forget",
      "spacing out",
    ],
  },
  substance: {
    pl: [
      "za dużo piłem",
      "nie mogę przestać pić",
      "muszę się napić",
      "odstawienie",
      "nie kontroluję picia",
      "biorę za dużo",
      "uzależnienie",
      "przedawkowałem",
    ],
    en: [
      "too much drinking",
      "can't stop using",
      "need a drink",
      "withdrawal",
      "can't control",
      "overdose",
      "blackout",
      "relapse",
    ],
  },
};

// ============================================================================
// VAD MAPPING (Russell's Circumplex Model)
// ============================================================================

const EMOTION_VAD: Record<
  string,
  { valence: number; arousal: number; dominance: number }
> = {
  // Positive
  happy: { valence: 0.8, arousal: 0.6, dominance: 0.7 },
  joy: { valence: 0.9, arousal: 0.7, dominance: 0.7 },
  love: { valence: 0.9, arousal: 0.5, dominance: 0.5 },
  excitement: { valence: 0.7, arousal: 0.9, dominance: 0.6 },
  amusement: { valence: 0.8, arousal: 0.5, dominance: 0.6 },
  gratitude: { valence: 0.8, arousal: 0.3, dominance: 0.4 },
  pride: { valence: 0.7, arousal: 0.5, dominance: 0.8 },
  optimism: { valence: 0.7, arousal: 0.5, dominance: 0.6 },
  admiration: { valence: 0.6, arousal: 0.4, dominance: 0.3 },

  // Neutral
  neutral: { valence: 0.0, arousal: 0.4, dominance: 0.5 },
  surprise: { valence: 0.1, arousal: 0.8, dominance: 0.4 },
  realization: { valence: 0.1, arousal: 0.5, dominance: 0.5 },
  curiosity: { valence: 0.3, arousal: 0.6, dominance: 0.5 },
  approval: { valence: 0.4, arousal: 0.3, dominance: 0.5 },
  caring: { valence: 0.5, arousal: 0.3, dominance: 0.4 },
  desire: { valence: 0.3, arousal: 0.6, dominance: 0.5 },

  // Negative - stress
  anger: { valence: -0.6, arousal: 0.8, dominance: 0.7 },
  annoyance: { valence: -0.4, arousal: 0.6, dominance: 0.6 },
  nervousness: { valence: -0.5, arousal: 0.7, dominance: 0.3 },
  fear: { valence: -0.8, arousal: 0.7, dominance: 0.2 },
  disgust: { valence: -0.7, arousal: 0.5, dominance: 0.5 },
  confusion: { valence: -0.3, arousal: 0.5, dominance: 0.3 },
  disapproval: { valence: -0.4, arousal: 0.4, dominance: 0.6 },
  embarrassment: { valence: -0.5, arousal: 0.6, dominance: 0.2 },

  // Negative - low
  sadness: { valence: -0.7, arousal: 0.3, dominance: 0.3 },
  grief: { valence: -0.9, arousal: 0.4, dominance: 0.2 },
  disappointment: { valence: -0.5, arousal: 0.3, dominance: 0.3 },
  remorse: { valence: -0.6, arousal: 0.3, dominance: 0.3 },
};

// Map HuggingFace/keyword labels to primary emotions
const LABEL_TO_PRIMARY: Record<string, PrimaryEmotion> = {
  joy: "happy",
  love: "happy",
  optimism: "happy",
  amusement: "happy",
  excitement: "happy",
  gratitude: "happy",
  pride: "happy",
  admiration: "happy",
  happy: "happy",

  sadness: "sad",
  grief: "sad",
  disappointment: "sad",
  remorse: "sad",

  anger: "angry",
  annoyance: "angry",
  disapproval: "angry",

  fear: "fearful",
  nervousness: "fearful",

  disgust: "disgusted",

  surprise: "surprised",
  realization: "surprised",

  neutral: "neutral",
  approval: "neutral",
  caring: "neutral",
  curiosity: "neutral",
  desire: "neutral",
  confusion: "neutral",
  embarrassment: "neutral",
};

// ============================================================================
// POLISH KEYWORD DETECTION
// ============================================================================

const PL_EMOTION_KEYWORDS: Record<string, string[]> = {
  happy: [
    "super",
    "świetnie",
    "fajnie",
    "dobry",
    "udany",
    "cieszę",
    "radość",
    "szczęśliwy",
    "ekstra",
    "bomba",
    "git",
    "fantastycznie",
    "wspaniale",
  ],
  angry: [
    "wkurz",
    "złość",
    "wściekły",
    "irytuje",
    "denerwuje",
    "kurwa",
    "cholera",
    "szlag",
    "nic nie działa",
    "mam dość",
  ],
  fearful: [
    "boję się",
    "strach",
    "przerażony",
    "lęk",
    "obawiam",
    "niepokój",
    "martwię się",
    "stresuje",
    "panika",
  ],
  sad: [
    "smutny",
    "źle",
    "kiepsko",
    "beznadziejnie",
    "depresja",
    "nie chce mi się",
    "zmęczony",
    "ciężko",
    "trudno",
    "przybity",
    "załamany",
    "nie mam siły",
  ],
  neutral: [
    "ok",
    "dobrze",
    "normalnie",
    "spokojnie",
    "w porządku",
    "tak sobie",
  ],
};

// ============================================================================
// HUGGINGFACE API
// ============================================================================

const HF_API_URL =
  "https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base";

interface HFEmotion {
  label: string;
  score: number;
}

/** HuggingFace emotion analysis with 1.5s timeout (cold starts can take 10-30s) */
async function analyzeWithHuggingFace(
  text: string,
): Promise<HFEmotion[] | null> {
  const hfToken = process.env.HUGGINGFACE_API_KEY;
  if (!hfToken) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const results = await response.json();
    const emotions: HFEmotion[] = Array.isArray(results[0])
      ? results[0]
      : results;

    if (!emotions || emotions.length === 0) return null;

    emotions.sort((a, b) => b.score - a.score);
    return emotions;
  } catch (error) {
    // AbortError = timeout — fall back to keyword analysis silently
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(
        "[EmotionAnalyzer] HuggingFace timed out (1.5s), using keyword fallback",
      );
      return null;
    }
    console.error("[EmotionAnalyzer] HuggingFace error:", error);
    return null;
  }
}

// ============================================================================
// KEYWORD ANALYSIS (Polish)
// ============================================================================

function analyzeByKeywords(text: string): {
  label: string;
  confidence: number;
  matchedKeywords: string[];
} {
  const lower = text.toLowerCase();
  const matchedKeywords: string[] = [];

  for (const [emotion, keywords] of Object.entries(PL_EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matchedKeywords.push(keyword);
        return { label: emotion, confidence: 0.6, matchedKeywords };
      }
    }
  }

  return { label: "neutral", confidence: 0.3, matchedKeywords: [] };
}

// ============================================================================
// CRISIS KEYWORD SCAN
// ============================================================================

export function scanCrisisKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const flags: string[] = [];

  for (const [type, keywords] of Object.entries(CRISIS_KEYWORDS)) {
    for (const lang of ["pl", "en"] as const) {
      for (const keyword of keywords[lang]) {
        if (lower.includes(keyword)) {
          flags.push(`${type}:keyword:${keyword}`);
        }
      }
    }
  }

  return flags;
}

// ============================================================================
// BUILD EMOTION STATE
// ============================================================================

function buildEmotionState(
  topLabel: string,
  topScore: number,
  allEmotions: HFEmotion[],
  matchedKeywords: string[],
  crisisKeywords: string[],
  source: EmotionState["source"],
  voiceFeatures?: VoiceFeatures | null,
): EmotionState {
  const primary = LABEL_TO_PRIMARY[topLabel] || "neutral";
  const vad = EMOTION_VAD[topLabel] || EMOTION_VAD["neutral"];

  // Calculate intensity: base from confidence, boost from keyword density
  const keywordBoost = Math.min(matchedKeywords.length * 10, 20);
  const crisisBoost = crisisKeywords.length > 0 ? 20 : 0;
  const rawIntensity = topScore * 80 + keywordBoost + crisisBoost;
  const intensity = Math.round(Math.min(Math.max(rawIntensity, 0), 100));

  // Secondary emotions (top 3 excluding primary)
  const secondary = allEmotions
    .filter((e) => LABEL_TO_PRIMARY[e.label] !== primary && e.score > 0.1)
    .slice(0, 3)
    .map((e) => e.label);

  const textSentiment: TextSentiment = {
    emotions: allEmotions.slice(0, 5),
    keywords_matched: matchedKeywords,
    language: matchedKeywords.length > 0 ? "pl" : "unknown",
    crisis_keywords_matched: crisisKeywords,
  };

  // Fusion: adjust VAD based on voice prosody (Phase 2)
  let finalValence = vad.valence;
  let finalArousal = vad.arousal;
  let finalSource = source;

  if (voiceFeatures && voiceFeatures.speech_rate > 0) {
    finalSource = "fusion";

    // High speech rate (>180 WPM) → excitement/anxiety → boost arousal
    if (voiceFeatures.speech_rate > 180) {
      finalArousal = Math.min(1.0, finalArousal + 0.15);
    }
    // Low speech rate (<100 WPM) → sadness/fatigue → lower arousal
    if (voiceFeatures.speech_rate < 100) {
      finalArousal = Math.max(0, finalArousal - 0.1);
    }
    // Many pauses (>8/min) → hesitancy → slight negative valence
    if (voiceFeatures.pause_frequency > 8) {
      finalValence = Math.max(-1.0, finalValence - 0.1);
    }
    // Long pauses (>1s avg) → emotional difficulty → lower arousal
    if (voiceFeatures.pause_duration_avg > 1.0) {
      finalArousal = Math.max(0, finalArousal - 0.05);
    }
  }

  return {
    primary_emotion: primary,
    intensity,
    secondary_emotions: secondary,
    valence: Math.round(finalValence * 100) / 100,
    arousal: Math.round(finalArousal * 100) / 100,
    dominance: vad.dominance,
    confidence: topScore,
    source: finalSource,
    raw_data: {
      text_sentiment: textSentiment,
      voice_features: voiceFeatures || null,
      face_detected: null,
    },
  };
}

// ============================================================================
// MAIN EXPORT: analyzeEmotion
// ============================================================================

/**
 * Analyze text for emotional content using multi-strategy approach.
 * Returns EmotionState with VAD dimensions and crisis keyword flags.
 *
 * Strategy order:
 * 1. HuggingFace API (if key available, text > 10 chars)
 * 2. Polish keyword matching (fallback)
 *
 * Crisis keywords are always scanned regardless of strategy.
 */
export async function analyzeEmotion(
  text: string,
  voiceFeatures?: VoiceFeatures | null,
): Promise<EmotionState> {
  // Always scan for crisis keywords (fast, no API)
  const crisisFlags = scanCrisisKeywords(text);

  // Skip analysis for very short text
  if (text.length < 5) {
    return buildEmotionState(
      "neutral",
      0.3,
      [{ label: "neutral", score: 0.3 }],
      [],
      crisisFlags,
      "text_keywords",
      voiceFeatures,
    );
  }

  // Strategy 1: HuggingFace API
  const hfEmotions = await analyzeWithHuggingFace(text);
  if (hfEmotions && hfEmotions.length > 0) {
    // Also check Polish keywords for extra signal
    const { matchedKeywords } = analyzeByKeywords(text);
    return buildEmotionState(
      hfEmotions[0].label,
      hfEmotions[0].score,
      hfEmotions,
      matchedKeywords,
      crisisFlags,
      "text_hf",
      voiceFeatures,
    );
  }

  // Strategy 2: Polish keyword fallback
  const { label, confidence, matchedKeywords } = analyzeByKeywords(text);
  return buildEmotionState(
    label,
    confidence,
    [{ label, score: confidence }],
    matchedKeywords,
    crisisFlags,
    "text_keywords",
    voiceFeatures,
  );
}
