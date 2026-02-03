'use client'

/**
 * VoiceInterface - Main voice interaction component
 *
 * Uses Web Speech API for STT + Claude for LLM + ElevenLabs for TTS.
 * Replaces the old VAPI-based GlobalVoiceButton.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, Volume2, X } from 'lucide-react'
import {
  createSpeechRecognition,
  isWebSpeechSupported,
  type WebSpeechInstance
} from '@/lib/voice/web-speech'

// ============================================================================
// TYPES
// ============================================================================

interface VoiceInterfaceProps {
  tenantId: string
  className?: string
  position?: 'fixed' | 'inline'
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VoiceInterface({
  tenantId,
  className = '',
  position = 'fixed'
}: VoiceInterfaceProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSupported, setIsSupported] = useState(true)

  const speechRef = useRef<WebSpeechInstance | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // Check browser support
  useEffect(() => {
    setIsSupported(isWebSpeechSupported())
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechRef.current?.stop()
      audioRef.current?.pause()
      audioContextRef.current?.close()
    }
  }, [])

  // ============================================================================
  // AUDIO PLAYBACK
  // ============================================================================

  const playAudio = useCallback(async (audioBase64: string) => {
    try {
      setState('speaking')

      // Decode base64 to blob
      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)

      // Play audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        setState('idle')
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        console.error('[VoiceInterface] Audio playback error')
        setState('idle')
      }

      await audio.play()
    } catch (err) {
      console.error('[VoiceInterface] Audio playback failed:', err)
      setState('idle')
    }
  }, [])

  // ============================================================================
  // SEND MESSAGE TO API
  // ============================================================================

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    setState('processing')
    setTranscript('')

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    try {
      const response = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          sessionId,
          generateAudio: true
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      // Store session ID
      if (data.sessionId) {
        setSessionId(data.sessionId)
      }

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

      // Play TTS audio
      if (data.audio) {
        await playAudio(data.audio)
      } else {
        setState('idle')
      }
    } catch (err) {
      console.error('[VoiceInterface] Send error:', err)
      setError('Nie udało się przetworzyć wiadomości. Spróbuj ponownie.')
      setState('error')
      setTimeout(() => {
        setError(null)
        setState('idle')
      }, 3000)
    }
  }, [sessionId, playAudio])

  // ============================================================================
  // START/STOP LISTENING
  // ============================================================================

  const startListening = useCallback(() => {
    setError(null)
    setTranscript('')

    const speech = createSpeechRecognition({
      language: 'pl-PL',
      continuous: false,
      interimResults: true,
      onResult: (text, isFinal) => {
        setTranscript(text)
        if (isFinal) {
          sendMessage(text)
        }
      },
      onError: (err) => {
        setError(err)
        setState('error')
        setTimeout(() => {
          setError(null)
          setState('idle')
        }, 3000)
      },
      onStart: () => {
        setState('listening')
        setIsExpanded(true)
      },
      onEnd: () => {
        if (state === 'listening') {
          // If ended without final result, send what we have
          if (transcript.trim()) {
            sendMessage(transcript)
          } else {
            setState('idle')
          }
        }
      }
    })

    speechRef.current = speech
    speech.start()
  }, [sendMessage, state, transcript])

  const stopListening = useCallback(() => {
    speechRef.current?.stop()
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    setState('idle')
  }, [])

  // ============================================================================
  // HANDLE CLICK
  // ============================================================================

  const handleClick = useCallback(() => {
    switch (state) {
      case 'idle':
        startListening()
        break
      case 'listening':
        stopListening()
        break
      case 'speaking':
        stopSpeaking()
        break
      case 'error':
        setState('idle')
        setError(null)
        break
    }
  }, [state, startListening, stopListening, stopSpeaking])

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isSupported) {
    return null // Don't render if Web Speech API not available
  }

  const stateConfig = {
    idle: {
      icon: <Mic className="w-6 h-6" />,
      color: 'bg-blue-600 hover:bg-blue-700',
      pulse: false,
      label: 'Mów'
    },
    listening: {
      icon: <MicOff className="w-6 h-6" />,
      color: 'bg-red-500 hover:bg-red-600',
      pulse: true,
      label: 'Słucham...'
    },
    processing: {
      icon: <Loader2 className="w-6 h-6 animate-spin" />,
      color: 'bg-yellow-500',
      pulse: false,
      label: 'Myślę...'
    },
    speaking: {
      icon: <Volume2 className="w-6 h-6" />,
      color: 'bg-green-500 hover:bg-green-600',
      pulse: true,
      label: 'Mówię...'
    },
    error: {
      icon: <X className="w-6 h-6" />,
      color: 'bg-red-700',
      pulse: false,
      label: 'Błąd'
    }
  }

  const config = stateConfig[state]

  const buttonClasses = position === 'fixed'
    ? 'fixed bottom-6 right-6 z-50'
    : ''

  return (
    <div className={`${buttonClasses} ${className}`}>
      {/* Expanded conversation panel */}
      {isExpanded && messages.length > 0 && (
        <div className="mb-3 bg-slate-800 rounded-xl border border-slate-700 p-4 max-w-sm shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-400 font-medium">IORS</span>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {messages.slice(-4).map((msg, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 text-blue-200 ml-4'
                    : 'bg-slate-700 text-slate-200 mr-4'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript indicator */}
      {transcript && state === 'listening' && (
        <div className="mb-2 bg-slate-800/90 rounded-lg px-3 py-2 text-sm text-slate-300 max-w-xs">
          {transcript}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-2 bg-red-900/80 rounded-lg px-3 py-2 text-sm text-red-200 max-w-xs">
          {error}
        </div>
      )}

      {/* Main voice button */}
      <button
        onClick={handleClick}
        disabled={state === 'processing'}
        className={`
          ${config.color}
          text-white rounded-full w-14 h-14 flex items-center justify-center
          shadow-lg transition-all duration-200
          ${config.pulse ? 'animate-pulse' : ''}
          ${state === 'processing' ? 'cursor-wait' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        `}
        title={config.label}
        aria-label={config.label}
      >
        {config.icon}
      </button>
    </div>
  )
}
