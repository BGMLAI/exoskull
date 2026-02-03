'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Send, Mic, MicOff, Loader2, Volume2 } from 'lucide-react'
import {
  createSpeechRecognition,
  isWebSpeechSupported,
  type WebSpeechInstance
} from '@/lib/voice/web-speech'

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type: 'text' | 'voice_transcript'
  toolsUsed?: string[]
  timestamp: Date
}

type InputMode = 'text' | 'voice'

// ============================================================================
// PAGE
// ============================================================================

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('text')
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isSpeechSupported, setIsSpeechSupported] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speechRef = useRef<WebSpeechInstance | null>(null)

  useEffect(() => {
    setIsSpeechSupported(isWebSpeechSupported())
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============================================================================
  // SEND MESSAGE
  // ============================================================================

  const sendMessage = useCallback(async (text: string, type: 'text' | 'voice_transcript' = 'text') => {
    if (!text.trim() || isLoading) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      type,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTranscript('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          conversationId
        })
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()

      if (data.conversationId) {
        setConversationId(data.conversationId)
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.text,
        type: 'text',
        toolsUsed: data.toolsUsed,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMsg])

      // If in voice mode, speak the response
      if (type === 'voice_transcript') {
        speakResponse(data.text)
      }
    } catch (err) {
      console.error('[Chat] Send error:', err)
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Przepraszam, wystąpił błąd. Spróbuj ponownie.',
        type: 'text',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, isLoading])

  // ============================================================================
  // TTS PLAYBACK
  // ============================================================================

  const speakResponse = async (text: string) => {
    try {
      const res = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          generateAudio: true,
          sessionId: conversationId
        })
      })

      // We already have the text, just want the audio
      // Actually, let's use a simpler TTS-only approach
      // For now, skip TTS in chat mode (voice button handles it separately)
    } catch (err) {
      // TTS is optional, don't block
    }
  }

  // ============================================================================
  // VOICE INPUT
  // ============================================================================

  const startListening = useCallback(() => {
    setTranscript('')
    const speech = createSpeechRecognition({
      language: 'pl-PL',
      continuous: false,
      interimResults: true,
      onResult: (text, isFinal) => {
        setTranscript(text)
        if (isFinal) {
          setIsListening(false)
          sendMessage(text, 'voice_transcript')
        }
      },
      onStart: () => setIsListening(true),
      onEnd: () => setIsListening(false),
      onError: () => setIsListening(false)
    })

    speechRef.current = speech
    speech.start()
  }, [sendMessage])

  const stopListening = useCallback(() => {
    speechRef.current?.stop()
    setIsListening(false)
  }, [])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-slate-300 mb-2">
                Cześć! Jestem IORS.
              </h2>
              <p className="text-slate-500">
                Napisz wiadomość lub kliknij mikrofon, żeby porozmawiać.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.type === 'voice_transcript' && (
                <span className="text-xs opacity-60 mt-1 block">
                  <Mic className="w-3 h-3 inline mr-1" />głos
                </span>
              )}
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <span className="text-xs opacity-60 mt-1 block">
                  Użyto: {msg.toolsUsed.join(', ')}
                </span>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 rounded-2xl px-4 py-3">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Transcript indicator */}
      {transcript && isListening && (
        <div className="px-4 py-2 bg-slate-800 border-t border-slate-700">
          <p className="text-sm text-slate-400 italic">{transcript}</p>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          {/* Voice toggle */}
          {isSpeechSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-3 rounded-full transition-colors ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              title={isListening ? 'Zatrzymaj' : 'Mów'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Napisz wiadomość..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
