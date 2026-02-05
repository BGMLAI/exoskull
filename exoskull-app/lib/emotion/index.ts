/**
 * Emotion Intelligence — Layer 11 Module Index
 */

export { analyzeEmotion, scanCrisisKeywords } from "./text-analyzer";
export { detectCrisis } from "./crisis-detector";
export { getAdaptivePrompt } from "./adaptive-responses";
export { logEmotion, getEmotionHistory } from "./logger";
export type {
  EmotionState,
  CrisisAssessment,
  CrisisProtocol,
  CrisisType,
  CrisisSeverity,
  ResponseMode,
  AdaptivePrompt,
  TextSentiment,
  VoiceFeatures,
  FaceData,
  EmotionLogEntry,
} from "./types";
