/**
 * Web Speech API Wrapper
 *
 * Provides browser-based Speech-to-Text using the Web Speech API.
 * Falls back gracefully when not supported.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// TYPES
// ============================================================================

export interface WebSpeechOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  onResult?: (transcript: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStart?: () => void
  onEnd?: () => void
}

export interface WebSpeechInstance {
  start: () => void
  stop: () => void
  isListening: () => boolean
}

// ============================================================================
// SUPPORT CHECK
// ============================================================================

export function isWebSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as any
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

// ============================================================================
// CREATE SPEECH RECOGNITION
// ============================================================================

export function createSpeechRecognition(
  options: WebSpeechOptions = {}
): WebSpeechInstance {
  const {
    language = 'pl-PL',
    continuous = false,
    interimResults = true,
    onResult,
    onError,
    onStart,
    onEnd
  } = options

  if (!isWebSpeechSupported()) {
    console.error('[WebSpeech] Speech Recognition not supported in this browser')
    return {
      start: () => onError?.('Speech Recognition not supported'),
      stop: () => {},
      isListening: () => false
    }
  }

  const w = window as any
  const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition

  const recognition = new SpeechRecognition()
  let listening = false

  recognition.lang = language
  recognition.continuous = continuous
  recognition.interimResults = interimResults
  recognition.maxAlternatives = 1

  recognition.onstart = () => {
    listening = true
    onStart?.()
  }

  recognition.onresult = (event: any) => {
    const lastResult = event.results[event.results.length - 1]
    const transcript = lastResult[0].transcript
    const isFinal = lastResult.isFinal
    onResult?.(transcript, isFinal)
  }

  recognition.onerror = (event: any) => {
    console.error('[WebSpeech] Error:', event.error)
    listening = false

    if (event.error === 'not-allowed') {
      onError?.('Microphone access denied. Please allow microphone access.')
    } else if (event.error === 'no-speech') {
      onError?.('No speech detected. Try again.')
    } else if (event.error === 'network') {
      onError?.('Network error. Check your connection.')
    } else {
      onError?.(event.error)
    }
  }

  recognition.onend = () => {
    listening = false
    onEnd?.()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch (error) {
        console.error('[WebSpeech] Start error:', error)
        onError?.('Failed to start speech recognition')
      }
    },
    stop: () => {
      try {
        recognition.stop()
      } catch (error) {
        // Ignore - may already be stopped
      }
    },
    isListening: () => listening
  }
}
