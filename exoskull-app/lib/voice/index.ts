/**
 * Voice Pipeline Module
 *
 * Exports all voice-related utilities for the Twilio + ElevenLabs + Claude pipeline.
 */

// Twilio client helpers
export {
  generateGatherTwiML,
  generatePlayAndGatherTwiML,
  generateEndCallTwiML,
  generateErrorTwiML,
  generateSayAndGatherTwiML,
  makeOutboundCall,
  validateTwilioSignature,
  getTwilioClient
} from './twilio-client'
export type { GatherOptions, OutboundCallOptions } from './twilio-client'

// ElevenLabs TTS
export {
  textToSpeech,
  uploadTTSAudio,
  generateAndUploadTTS,
  precacheCommonPhrases,
  cleanupSessionAudio
} from './elevenlabs-tts'
export type { TTSOptions, TTSResult } from './elevenlabs-tts'

// ElevenLabs STT
export {
  speechToText,
  speechToTextFromUrl,
  speechToTextDeepgram,
  transcribeAudio,
  transcribeAudioFromUrl
} from './elevenlabs-stt'
export type { STTOptions, STTResult } from './elevenlabs-stt'

// Conversation Handler
export {
  getOrCreateSession,
  updateSession,
  endSession,
  processUserMessage,
  generateGreeting,
  findTenantByPhone
} from './conversation-handler'
export type { VoiceSession, ConversationResult } from './conversation-handler'

// System Prompt (re-export from existing)
export { PSYCODE_PROMPT, STATIC_SYSTEM_PROMPT, buildFullSystemPrompt } from './system-prompt'
