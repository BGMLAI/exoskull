import { NextResponse } from 'next/server'
import { VapiClient } from '@vapi-ai/server-sdk'

const VAPI_API_KEY = process.env.VAPI_API_KEY!

export async function POST(request: Request) {
  try {
    const vapi = new VapiClient({
      token: VAPI_API_KEY
    })

    // Create assistant configuration
    const assistant = await vapi.assistants.create({
      name: 'Exoskull Assistant',
      model: {
        provider: 'openai',
        model: 'gpt-4',
        messages: [{
          role: 'system',
          content: `Jesteś asystentem AI w systemie Exoskull - Adaptive Life Operating System.

Rozmawiasz po polsku. Jesteś pomocny, empatyczny i profesjonalny.

Pomagasz użytkownikowi:
- Organizować dzień i zadania
- Monitorować poziom energii i samopoczucie
- Znajdować wzorce w zachowaniach
- Identyfikować luki w systemie osobistym

Zawsze pytaj o poziom energii (1-10) na początku rozmowy.
Bądź zwięzły ale ciepły w tonie.`
        }]
      },
      voice: {
        provider: 'deepgram',
        voiceId: 'asteria'
      },
      firstMessage: 'Cześć! Jak się dziś czujesz? Na skali od 1 do 10, jaki masz poziom energii?',
      transcriber: {
        provider: 'deepgram',
        language: 'pl'
      }
    })

    console.log('✅ Assistant created:', assistant.id)

    return NextResponse.json({
      assistantId: assistant.id
    })
  } catch (error: any) {
    console.error('Failed to create VAPI assistant:', error)
    return NextResponse.json(
      { error: 'Failed to create assistant', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
