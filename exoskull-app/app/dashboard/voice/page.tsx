'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default function VoicePage() {
  const [isConnected, setIsConnected] = useState(false)
  const [vapi, setVapi] = useState<Vapi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const startConversation = async () => {
    try {
      setError(null)
      console.log('🚀 Starting VAPI conversation...')

      // Create conversation record and get tenant_id
      const convResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { started_via: 'voice_dashboard' } })
      })
      const { conversation, tenant_id } = await convResponse.json()
      setConversationId(conversation.id)
      console.log('📝 Created conversation:', conversation.id)
      console.log('👤 Tenant ID:', tenant_id)

      // Generate dynamic greeting
      const hour = new Date().getHours()
      console.log('⏰ Generating greeting for hour:', hour)

      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour })
      })

      const { greeting, context } = await greetingResponse.json()
      console.log('👋 Generated greeting:', greeting)
      console.log('📝 Context:', context)

      // Create VAPI instance with public key
      const vapiInstance = new Vapi(VAPI_PUBLIC_KEY)

      vapiInstance.on('call-start', async () => {
        console.log('✅ Call started')
        setIsConnected(true)

        // Save initial greeting as first message
        if (conversation.id && greeting) {
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
        console.log('📞 Call ended')
        setIsConnected(false)
        setConversationId(null)
      })

      vapiInstance.on('speech-start', () => {
        console.log('🎤 User started speaking')
      })

      vapiInstance.on('speech-end', () => {
        console.log('🔇 User stopped speaking')
      })

      vapiInstance.on('message', async (message: any) => {
        console.log('💬 Message:', message)

        // Save message to database
        if (conversation.id && message.role && message.content) {
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
            console.log('💾 Message saved')
          } catch (e) {
            console.error('Failed to save message:', e)
          }
        }
      })

      vapiInstance.on('error', (error: any) => {
        console.error('❌ VAPI error:', error)
        setError(error.message || 'Unknown error')
      })

      // Start the call with inline assistant configuration + tools
      await vapiInstance.start({
        model: {
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt: `Jesteś ExoSkull - drugi mózg użytkownika.
Znasz go, pamiętasz wszystko, rozumiesz kontekst.

DOPASOWUJ TON do sytuacji:
- Wyczuj porę dnia, nastrój, energię użytkownika z głosu
- Dostosuj się: ciepły gdy zmęczony, zwięzły gdy zajęty, wspierający gdy zestresowany
- Pytaj naturalnie - nie według szablonu

ZAWSZE po polsku.

Nie tłumacz co robisz ("widzę że jesteś zmęczony") - po prostu dostosuj ton.
Nie używaj fraz botowych ("jestem tutaj żeby pomóc", "czym mogę służyć").
Nie wymieniaj swoich funkcji.

Rozmawiaj jak ktoś kto naprawdę rozumie - nie jak asystent.

Gdy user unika tematu - zauważ, ale delikatnie.
Gdy user brzmi inaczej niż zwykle - zareaguj naturalnie.

ZARZĄDZANIE ZADANIAMI (WAŻNE):
- Na początku rozmowy ZAWSZE wywołaj get_tasks żeby zobaczyć aktualne zadania użytkownika
- Gdy user mówi "dodaj zadanie X", "zapisz mi X", "przypomnij mi o X" → wywołaj create_task
- Gdy user mówi "zrobiłem X", "wykonałem X", "skończyłem X" → wywołaj complete_task
- NIE WYMYŚLAJ zadań - tylko te zwrócone przez get_tasks są prawdziwe
- Jeśli user pyta o zadania a get_tasks zwraca pustą listę, powiedz że nie ma zadań`,
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_tasks',
                description: 'Pobierz listę zadań użytkownika. Wywołaj na początku rozmowy i gdy user pyta o zadania.',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              },
              server: {
                url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}`
              }
            },
            {
              type: 'function',
              function: {
                name: 'create_task',
                description: 'Dodaj nowe zadanie. Użyj gdy user chce coś dodać do listy zadań.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Tytuł zadania - krótki i konkretny'
                    },
                    priority: {
                      type: 'number',
                      description: 'Priorytet: 1=pilne, 2=ważne, 3=normalne, 4=niski'
                    },
                    due_date: {
                      type: 'string',
                      description: 'Termin w formacie YYYY-MM-DD (opcjonalne)'
                    }
                  },
                  required: ['title']
                }
              },
              server: {
                url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}`
              }
            },
            {
              type: 'function',
              function: {
                name: 'complete_task',
                description: 'Oznacz zadanie jako wykonane. Użyj gdy user mówi że coś zrobił.',
                parameters: {
                  type: 'object',
                  properties: {
                    task_id: {
                      type: 'string',
                      description: 'ID zadania do oznaczenia jako wykonane'
                    }
                  },
                  required: ['task_id']
                }
              },
              server: {
                url: `${APP_URL}/api/voice/tools?tenant_id=${tenant_id}&conversation_id=${conversation.id}`
              }
            }
          ]
        } as any,
        voice: {
          provider: 'openai',
          voiceId: 'nova'
        },
        firstMessage: greeting,
        transcriber: {
          provider: 'deepgram',
          language: 'pl'
        }
      } as any, {
        // AssistantOverrides - second parameter
        metadata: {
          tenant_id: tenant_id,
          conversation_id: conversation.id
        }
      })

      setVapi(vapiInstance)
      console.log('✅ VAPI conversation started successfully')
    } catch (error) {
      console.error('❌ Failed to start conversation:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      alert(`Nie udało się rozpocząć rozmowy: ${errorMessage}\n\nSprawdź konsolę (F12) dla szczegółów.`)
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
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rozmowa głosowa</h1>
        <p className="text-muted-foreground">
          Porozmawiaj z asystentem AI głosowo
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status rozmowy</CardTitle>
          <CardDescription>
            {isConnected ? 'Połączony - możesz mówić' : 'Gotowy do rozmowy'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-sm">
              {isConnected ? 'Połączenie aktywne' : 'Brak połączenia'}
            </span>
          </div>

          <div className="flex gap-2">
            {!isConnected ? (
              <Button onClick={startConversation} className="w-full">
                Rozpocznij rozmowę
              </Button>
            ) : (
              <Button onClick={endConversation} variant="destructive" className="w-full">
                Zakończ rozmowę
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jak to działa?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Kliknij "Rozpocznij rozmowę"</p>
          <p>2. Zezwól na dostęp do mikrofonu</p>
          <p>3. Czekaj aż asystent się przywita</p>
          <p>4. Rozmawiaj naturalnie - asystent rozumie polski</p>
          <p>5. Kliknij "Zakończ rozmowę" gdy skończysz</p>
        </CardContent>
      </Card>
    </div>
  )
}
