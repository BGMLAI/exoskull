import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { hour, lastConversationDays } = await req.json()

    // Kontekst dla AI
    const contextParts = []

    if (hour !== undefined) {
      const timeOfDay =
        hour < 10 ? 'rano (przed 10:00)' :
        hour < 18 ? 'w ciągu dnia (10-18)' :
        hour < 22 ? 'wieczorem (18-22)' :
        'późno w nocy (po 22:00)'
      contextParts.push(`Pora dnia: ${timeOfDay}`)
    }

    if (lastConversationDays !== undefined && lastConversationDays > 0) {
      contextParts.push(`Ostatnia rozmowa: ${lastConversationDays} dni temu`)
    } else if (lastConversationDays === 0) {
      contextParts.push('Ostatnia rozmowa: dzisiaj (kolejna rozmowa tego samego dnia)')
    }

    // Load recent conversation context (last 5 messages)
    let conversationHistory = ''
    if (user) {
      try {
        const { data: recentMessages } = await supabase
          .from('exo_messages')
          .select('role, content, timestamp')
          .eq('tenant_id', user.id)
          .order('timestamp', { ascending: false })
          .limit(5)

        if (recentMessages && recentMessages.length > 0) {
          const summaries = recentMessages.reverse().map(m => {
            const preview = m.content.substring(0, 100)
            return `${m.role === 'user' ? 'User' : 'ExoSkull'}: ${preview}`
          })
          conversationHistory = summaries.join('\n')
          contextParts.push(`Ostatnie rozmowy: ${recentMessages.length} wiadomości`)
        }
      } catch (e) {
        console.log('No conversation history yet')
      }
    }

    const context = contextParts.join('. ')

    // Generuj greeting przez OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Jesteś ExoSkull - drugi mózg użytkownika. Generujesz naturalne powitanie na początku rozmowy głosowej.

ZASADY:
- ZAWSZE po polsku
- Krótkie (max 2 zdania)
- Naturalne, nie jak bot
- Dopasowane do kontekstu (pora dnia, jak dawno ostatnia rozmowa)
- Bez fraz botowych ("czym mogę służyć", "jestem tutaj żeby pomóc")
- Bez wyjaśniania co robisz

PRZYKŁADY (inspiracja, nie kopiuj dosłownie):
- Rano, pierwszy raz: "Dzień dobry. Jak się czujesz?"
- Rano, druga rozmowa: "Hej ponownie. Co tam?"
- Wieczór: "Jak minął dzień?"
- Późno: "Jeszcze nie śpisz?"
- Po długiej przerwie: "Długo Cię nie było. Co słychać?"

WYGENERUJ TYLKO greeting (bez dodatkowych komentarzy).`
        },
        {
          role: 'user',
          content: `Kontekst: ${context}

${conversationHistory ? `\nOstatnie wiadomości:\n${conversationHistory}\n` : ''}
Wygeneruj naturalne powitanie:`
        }
      ],
      temperature: 0.8,
      max_tokens: 50
    })

    const greeting = completion.choices[0]?.message?.content?.trim() || 'Hej. Co tam?'

    return NextResponse.json({
      greeting,
      context
    })

  } catch (error) {
    console.error('Error generating greeting:', error)

    // Fallback
    return NextResponse.json({
      greeting: 'Hej. Jak się masz?',
      error: 'Fallback greeting used'
    }, { status: 200 })
  }
}
