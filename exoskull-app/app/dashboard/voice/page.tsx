'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChatPanel, ChatMessage } from '@/components/voice/ChatPanel'
import Vapi from '@vapi-ai/web'
import { buildFullSystemPrompt } from '@/lib/voice/system-prompt'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!

export default function VoicePage() {
  const [isConnected, setIsConnected] = useState(false)
  const [vapi, setVapi] = useState<Vapi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  // Chat panel state
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
      // If interim, replace last interim message of same role
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
      // Find and update the last interim message of this role
      const lastIndex = prev.findLastIndex(m => m.role === role && m.isInterim)
      if (lastIndex >= 0) {
        const updated = [...prev]
        updated[lastIndex] = { ...updated[lastIndex], content, isInterim: false }
        return updated
      }
      // If no interim, just add as final
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
      setError(null)
      setMessages([]) // Clear previous messages
      console.log('Starting VAPI conversation...')

      // Create conversation record and get tenant_id
      const convResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { started_via: 'voice_dashboard' } })
      })
      const { conversation, tenant_id } = await convResponse.json()
      setConversationId(conversation.id)
      console.log('Created conversation:', conversation.id)
      console.log('Tenant ID:', tenant_id)

      // Generate dynamic greeting
      const hour = new Date().getHours()
      console.log('Generating greeting for hour:', hour)

      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour })
      })

      const { greeting, context } = await greetingResponse.json()
      console.log('Generated greeting:', greeting)
      console.log('Context:', context)

      // Create VAPI instance with public key
      const vapiInstance = new Vapi(VAPI_PUBLIC_KEY)

      vapiInstance.on('call-start', async () => {
        console.log('Call started')
        setIsConnected(true)
        addMessage('system', 'Polaczenie nawiazane')

        // Save initial greeting as first message
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
        console.log('Call ended')
        setIsConnected(false)
        setIsUserSpeaking(false)
        setIsAgentSpeaking(false)
        setConversationId(null)
        addMessage('system', 'Rozmowa zakonczona')
      })

      vapiInstance.on('speech-start', () => {
        console.log('User started speaking')
        setIsUserSpeaking(true)
        setIsAgentSpeaking(false)
      })

      vapiInstance.on('speech-end', () => {
        console.log('User stopped speaking')
        setIsUserSpeaking(false)
      })

      // Handle transcript events (interim and final)
      // Note: 'transcript' event may not be in VAPI types but works at runtime
      ;(vapiInstance as any).on('transcript', (transcript: any) => {
        console.log('Transcript:', transcript)
        if (transcript.role === 'user') {
          if (transcript.transcriptType === 'partial') {
            addMessage('user', transcript.transcript, true)
          } else if (transcript.transcriptType === 'final') {
            finalizeInterimMessage('user', transcript.transcript)
          }
        }
      })

      vapiInstance.on('message', async (message: any) => {
        console.log('Message:', message)

        // Handle assistant speech
        if (message.type === 'speech-update') {
          if (message.status === 'started') {
            setIsAgentSpeaking(true)
          } else if (message.status === 'stopped') {
            setIsAgentSpeaking(false)
          }
        }

        // Handle transcript messages
        if (message.type === 'transcript' && message.role === 'assistant') {
          if (message.transcriptType === 'partial') {
            addMessage('assistant', message.transcript, true)
          } else if (message.transcriptType === 'final') {
            finalizeInterimMessage('assistant', message.transcript)
          }
        }

        // Save message to database
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
            console.log('Message saved')
          } catch (e) {
            console.error('Failed to save message:', e)
          }
        }
      })

      vapiInstance.on('error', (error: any) => {
        console.error('VAPI error:', error)
        setError(error.message || 'Unknown error')
        addMessage('system', `Blad: ${error.message || 'Nieznany blad'}`)
      })

      // Build system prompt with caching optimization
      const now = new Date()
      const systemPrompt = buildFullSystemPrompt({
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
      })

      // Start the call with inline assistant configuration (no tools - simpler, more reliable)
      await vapiInstance.start({
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt
        } as any,
        voice: {
          provider: '11labs',
          voiceId: 'vhGAGQee0VjHonqyxGxd',  // User's custom cloned voice
          stability: 0.5,
          similarityBoost: 0.75,
          model: 'eleven_turbo_v2_5'  // Latest turbo model
        },
        firstMessage: greeting,
        transcriber: {
          provider: 'deepgram',
          language: 'pl'
        },
        // VAPI timing optimizations for smooth voice
        silenceTimeoutSeconds: 30,
        responseDelaySeconds: 0.1,
        llmRequestDelaySeconds: 0.1,
        numWordsToInterruptAssistant: 2,
        maxDurationSeconds: 600
      } as any, {
        // AssistantOverrides - second parameter
        metadata: {
          tenant_id: tenant_id,
          conversation_id: conversation.id
        }
      })

      setVapi(vapiInstance)
      console.log('VAPI conversation started successfully')
    } catch (error) {
      console.error('Failed to start conversation:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      addMessage('system', `Blad: ${errorMessage}`)
      alert(`Nie udalo sie rozpoczac rozmowy: ${errorMessage}\n\nSprawdz konsole (F12) dla szczegolow.`)
    }
  }

  const endConversation = () => {
    if (vapi) {
      vapi.stop()
      setVapi(null)
      setIsConnected(false)
    }
  }

  return (
    <div className="p-8 space-y-6 h-full">
      <div>
        <h1 className="text-3xl font-bold">Rozmowa glosowa</h1>
        <p className="text-muted-foreground">
          Porozmawiaj z asystentem AI glosowo
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
        {/* Left column - Controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status rozmowy</CardTitle>
              <CardDescription>
                {isConnected ? 'Polaczony - mozesz mowic' : 'Gotowy do rozmowy'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-sm">
                  {isConnected ? 'Polaczenie aktywne' : 'Brak polaczenia'}
                </span>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                {!isConnected ? (
                  <Button onClick={startConversation} className="w-full">
                    Rozpocznij rozmowe
                  </Button>
                ) : (
                  <Button onClick={endConversation} variant="destructive" className="w-full">
                    Zakoncz rozmowe
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jak to dziala?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Kliknij &quot;Rozpocznij rozmowe&quot;</p>
              <p>2. Zezwol na dostep do mikrofonu</p>
              <p>3. Czekaj az asystent sie przywita</p>
              <p>4. Rozmawiaj naturalnie - asystent rozumie polski</p>
              <p>5. Kliknij &quot;Zakoncz rozmowe&quot; gdy skonczysz</p>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Chat transcript */}
        <ChatPanel
          messages={messages}
          isUserSpeaking={isUserSpeaking}
          isAgentSpeaking={isAgentSpeaking}
          className="min-h-[400px]"
        />
      </div>
    </div>
  )
}
