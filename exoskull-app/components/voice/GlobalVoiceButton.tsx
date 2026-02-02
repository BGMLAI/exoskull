'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, X, Phone, PhoneOff } from 'lucide-react'
import { ChatPanel, ChatMessage } from './ChatPanel'
import Vapi from '@vapi-ai/web'
import { buildFullSystemPrompt } from '@/lib/voice/system-prompt'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface GlobalVoiceButtonProps {
  tenantId: string
}

export function GlobalVoiceButton({ tenantId }: GlobalVoiceButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [vapi, setVapi] = useState<Vapi | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

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
        body: JSON.stringify({ context: { started_via: 'global_voice_button' } })
      })
      const { conversation, tenant_id } = await convResponse.json()
      setConversationId(conversation.id)

      // Generate greeting
      const hour = new Date().getHours()
      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour })
      })
      const { greeting } = await greetingResponse.json()

      // Create VAPI instance
      const vapiInstance = new Vapi(VAPI_PUBLIC_KEY)

      vapiInstance.on('call-start', async () => {
        setIsConnected(true)
        setIsConnecting(false)
        addMessage('system', 'Polaczenie nawiazane')

        if (conversation.id && greeting) {
          addMessage('assistant', greeting)
          await fetch(`/api/conversations/${conversation.id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: greeting,
              context: { type: 'greeting' }
            })
          })
        }
      })

      vapiInstance.on('call-end', () => {
        setIsConnected(false)
        setIsUserSpeaking(false)
        setIsAgentSpeaking(false)
        setConversationId(null)
        addMessage('system', 'Rozmowa zakonczona')
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
            console.error('Failed to save message:', e)
          }
        }
      })

      vapiInstance.on('error', (error: any) => {
        console.error('VAPI error:', error)
        setIsConnecting(false)
        addMessage('system', `Blad: ${error.message || 'Nieznany blad'}`)
      })

      // Build system prompt
      const now = new Date()
      const systemPrompt = buildFullSystemPrompt({
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
      })

      // Start VAPI call
      await vapiInstance.start({
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt,
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_tasks',
                description: 'Pobierz liste zadan uzytkownika.',
                parameters: { type: 'object', properties: {}, required: [] }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            },
            {
              type: 'function',
              function: {
                name: 'create_task',
                description: 'Dodaj nowe zadanie.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Tytul zadania' },
                    priority: { type: 'number', description: 'Priorytet: 1-4' },
                    due_date: { type: 'string', description: 'Termin YYYY-MM-DD' }
                  },
                  required: ['title']
                }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            },
            {
              type: 'function',
              function: {
                name: 'complete_task',
                description: 'Oznacz zadanie jako wykonane.',
                parameters: {
                  type: 'object',
                  properties: { task_id: { type: 'string', description: 'ID zadania' } },
                  required: ['task_id']
                }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            },
            {
              type: 'function',
              function: {
                name: 'get_schedule',
                description: 'Pobierz harmonogram check-inow i przypomnien uzytkownika.',
                parameters: { type: 'object', properties: {}, required: [] }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            },
            {
              type: 'function',
              function: {
                name: 'create_checkin',
                description: 'Dodaj nowe przypomnienie lub check-in. Uzyj gdy uzytkownik chce byc przypominany o czyms regularnie.',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Nazwa przypomnienia, np. "Poranny check-in"' },
                    time: { type: 'string', description: 'Godzina w formacie HH:MM, np. "08:00"' },
                    frequency: { type: 'string', description: 'Czestotliwosc: daily, weekdays, weekends, weekly' },
                    channel: { type: 'string', description: 'Kanal: voice, sms. Domyslnie voice.' },
                    message: { type: 'string', description: 'Tresc przypomnienia lub pytanie do zadania' }
                  },
                  required: ['name', 'time']
                }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            },
            {
              type: 'function',
              function: {
                name: 'toggle_checkin',
                description: 'Wlacz lub wylacz istniejacy check-in/przypomnienie.',
                parameters: {
                  type: 'object',
                  properties: {
                    checkin_name: { type: 'string', description: 'Nazwa check-inu do przelaczenia' },
                    enabled: { type: 'boolean', description: 'true = wlacz, false = wylacz' }
                  },
                  required: ['checkin_name', 'enabled']
                }
              },
              server: { url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}` }
            }
          ]
        } as any,
        voice: {
          provider: '11labs',
          voiceId: 'vhGAGQee0VjHonqyxGxd',
          stability: 0.5,
          similarityBoost: 0.75,
          model: 'eleven_turbo_v2_5'
        },
        firstMessage: greeting,
        transcriber: { provider: 'deepgram', language: 'pl' },
        silenceTimeoutSeconds: 30,
        responseDelaySeconds: 0.1,
        llmRequestDelaySeconds: 0.1,
        numWordsToInterruptAssistant: 2,
        maxDurationSeconds: 600
      } as any, {
        metadata: { tenant_id, conversation_id: conversation.id }
      })

      setVapi(vapiInstance)
    } catch (error) {
      console.error('Failed to start conversation:', error)
      setIsConnecting(false)
      addMessage('system', `Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`)
    }
  }

  const endConversation = () => {
    if (vapi) {
      vapi.stop()
      setVapi(null)
      setIsConnected(false)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    startConversation()
  }

  const handleClose = () => {
    endConversation()
    setIsOpen(false)
    setMessages([])
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapi) {
        vapi.stop()
      }
    }
  }, [vapi])

  if (!isOpen) {
    return (
      <Button
        variant="default"
        size="icon"
        onClick={handleOpen}
        className="fixed top-4 left-4 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        title="Rozpocznij rozmowe glosowa"
      >
        <Mic className="h-7 w-7" />
      </Button>
    )
  }

  return (
    <Card className="fixed top-4 left-4 z-50 w-96 h-[500px] shadow-xl flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          {isConnected ? (
            <Phone className="h-5 w-5 text-green-500" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
          {isConnecting ? 'Laczenie...' : isConnected ? 'Rozmowa aktywna' : 'Exo AI'}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
        <ChatPanel
          messages={messages}
          isUserSpeaking={isUserSpeaking}
          isAgentSpeaking={isAgentSpeaking}
          className="flex-1 border-0 rounded-none"
        />

        {isConnected && (
          <div className="p-3 border-t">
            <Button
              variant="destructive"
              onClick={endConversation}
              className="w-full"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Zakoncz rozmowe
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
