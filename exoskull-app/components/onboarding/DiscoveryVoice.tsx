'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, Phone, PhoneOff, ArrowLeft } from 'lucide-react'
import { ChatPanel, ChatMessage } from '@/components/voice/ChatPanel'
import Vapi from '@vapi-ai/web'
import { DISCOVERY_SYSTEM_PROMPT, DISCOVERY_FIRST_MESSAGE } from '@/lib/onboarding/discovery-prompt'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface DiscoveryVoiceProps {
  onComplete: (conversationId: string) => void
  onBack: () => void
}

export function DiscoveryVoice({ onComplete, onBack }: DiscoveryVoiceProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [vapi, setVapi] = useState<Vapi | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)

  const addMessage = useCallback((role: 'user' | 'assistant' | 'system', content: string, isInterim = false) => {
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
      isInterim
    }
    setMessages(prev => {
      if (isInterim) {
        const lastIndex = prev.findLastIndex(m => m.role === role && m.isInterim)
        if (lastIndex >= 0) {
          const updated = [...prev]
          updated[lastIndex] = newMessage
          return updated
        }
      }
      return [...prev, newMessage]
    })
  }, [])

  const finalizeInterimMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages(prev => {
      const lastIndex = prev.findLastIndex(m => m.role === role && m.isInterim)
      if (lastIndex >= 0) {
        const updated = [...prev]
        updated[lastIndex] = { ...updated[lastIndex], content, isInterim: false }
        return updated
      }
      return [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp: new Date(),
        isInterim: false
      }]
    })
  }, [])

  const startConversation = async () => {
    try {
      setIsConnecting(true)
      setMessages([])

      // Create conversation record
      const convResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            type: 'onboarding',
            started_via: 'discovery_voice'
          }
        })
      })
      const { conversation, tenant_id } = await convResponse.json()
      setConversationId(conversation.id)
      setTenantId(tenant_id)

      // Create VAPI instance
      const vapiInstance = new Vapi(VAPI_PUBLIC_KEY)

      vapiInstance.on('call-start', async () => {
        setIsConnected(true)
        setIsConnecting(false)
        addMessage('system', 'Połączenie nawiązane')
        addMessage('assistant', DISCOVERY_FIRST_MESSAGE)

        // Save first message
        if (conversation.id) {
          await fetch(`/api/conversations/${conversation.id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: DISCOVERY_FIRST_MESSAGE,
              context: { type: 'greeting' }
            })
          })
        }
      })

      vapiInstance.on('call-end', () => {
        setIsConnected(false)
        setIsUserSpeaking(false)
        setIsAgentSpeaking(false)
        addMessage('system', 'Rozmowa zakończona')

        // Trigger completion
        if (conversation.id) {
          onComplete(conversation.id)
        }
      })

      vapiInstance.on('speech-start', () => {
        setIsUserSpeaking(true)
        setIsAgentSpeaking(false)
      })

      vapiInstance.on('speech-end', () => {
        setIsUserSpeaking(false)
      })

      ;(vapiInstance as any).on('transcript', (transcript: any) => {
        if (transcript.role === 'user') {
          if (transcript.transcriptType === 'partial') {
            addMessage('user', transcript.transcript, true)
          } else if (transcript.transcriptType === 'final') {
            finalizeInterimMessage('user', transcript.transcript)
          }
        }
      })

      vapiInstance.on('message', async (message: any) => {
        if (message.type === 'speech-update') {
          if (message.status === 'started') {
            setIsAgentSpeaking(true)
          } else if (message.status === 'stopped') {
            setIsAgentSpeaking(false)
          }
        }

        if (message.type === 'transcript' && message.role === 'assistant') {
          if (message.transcriptType === 'partial') {
            addMessage('assistant', message.transcript, true)
          } else if (message.transcriptType === 'final') {
            finalizeInterimMessage('assistant', message.transcript)
          }
        }

        // Save messages to DB
        if (conversation.id && message.role && (message.content || message.transcript)) {
          try {
            await fetch(`/api/conversations/${conversation.id}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: message.role,
                content: message.content || message.transcript || '',
                context: { type: message.type }
              })
            })
          } catch (e) {
            console.error('[DiscoveryVoice] Failed to save message:', e)
          }
        }
      })

      vapiInstance.on('error', (error: any) => {
        console.error('[DiscoveryVoice] VAPI error:', error)
        setIsConnecting(false)
        addMessage('system', `Błąd: ${error.message || 'Nieznany błąd'}`)
      })

      // Start VAPI call with Discovery prompt
      await vapiInstance.start({
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: DISCOVERY_SYSTEM_PROMPT,
          tools: [
            {
              type: 'function',
              function: {
                name: 'save_onboarding_profile',
                description: 'Zapisz wyekstrahowany profil użytkownika po zakończeniu rozmowy onboardingowej.',
                parameters: {
                  type: 'object',
                  properties: {
                    preferred_name: { type: 'string', description: 'Jak użytkownik chce być nazywany' },
                    primary_goal: { type: 'string', description: 'Główny cel: sleep, productivity, health, fitness, mental_health, finance, relationships, learning, career' },
                    secondary_goals: { type: 'array', items: { type: 'string' }, description: 'Dodatkowe cele' },
                    conditions: { type: 'array', items: { type: 'string' }, description: 'Wyzwania: adhd, anxiety, depression, burnout, insomnia' },
                    communication_style: { type: 'string', description: 'Styl komunikacji: direct, warm, coaching' },
                    morning_checkin_time: { type: 'string', description: 'Preferowana godzina porannego check-inu HH:MM' },
                    insights: { type: 'array', items: { type: 'string' }, description: 'Kluczowe obserwacje o użytkowniku' }
                  },
                  required: ['preferred_name']
                }
              },
              server: { url: `${APP_URL}/api/onboarding/save-profile?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            }
          ]
        } as any,
        voice: {
          provider: '11labs',
          voiceId: 'Qs4qmNrqlneCgYPLSNQ7',
          stability: 0.5,
          similarityBoost: 0.75,
          model: 'eleven_turbo_v2_5'
        },
        firstMessage: DISCOVERY_FIRST_MESSAGE,
        transcriber: { provider: 'deepgram', language: 'pl' },
        silenceTimeoutSeconds: 60, // Longer for onboarding - user might think
        responseDelaySeconds: 0.3,
        llmRequestDelaySeconds: 0.1,
        numWordsToInterruptAssistant: 3,
        maxDurationSeconds: 1800 // 30 minutes max
      } as any, {
        metadata: { tenant_id, conversation_id: conversation.id, type: 'onboarding' }
      })

      setVapi(vapiInstance)
    } catch (error) {
      console.error('[DiscoveryVoice] Failed to start:', error)
      setIsConnecting(false)
      addMessage('system', `Błąd: ${error instanceof Error ? error.message : 'Nieznany błąd'}`)
    }
  }

  const endConversation = () => {
    if (vapi) {
      vapi.stop()
      setVapi(null)
      setIsConnected(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapi) {
        vapi.stop()
      }
    }
  }, [vapi])

  // Auto-start conversation when component mounts
  useEffect(() => {
    startConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card className="w-full max-w-2xl bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              endConversation()
              onBack()
            }}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            {isConnected ? (
              <Phone className="h-5 w-5 text-green-400" />
            ) : (
              <Mic className="h-5 w-5 text-slate-400" />
            )}
            {isConnecting ? 'Łączenie...' : isConnected ? 'Rozmowa w trakcie' : 'Przygotowanie...'}
          </CardTitle>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            {isUserSpeaking && (
              <span className="text-xs text-blue-400 animate-pulse">Mówisz...</span>
            )}
            {isAgentSpeaking && (
              <span className="text-xs text-green-400 animate-pulse">ExoSkull mówi...</span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col h-[500px] p-0">
        <ChatPanel
          messages={messages}
          isUserSpeaking={isUserSpeaking}
          isAgentSpeaking={isAgentSpeaking}
          className="flex-1 border-0 rounded-none bg-transparent"
        />

        {isConnected && (
          <div className="p-4 border-t border-slate-700">
            <Button
              variant="destructive"
              onClick={endConversation}
              className="w-full"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Zakończ rozmowę
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
