'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, MessageSquare, Loader2 } from 'lucide-react'
import { DiscoveryVoice } from '@/components/onboarding/DiscoveryVoice'
import { DiscoveryChat } from '@/components/onboarding/DiscoveryChat'

type Mode = 'select' | 'voice' | 'chat' | 'completed'

export default function OnboardingPage() {
  const [mode, setMode] = useState<Mode>('select')
  const [isExtracting, setIsExtracting] = useState(false)

  const handleComplete = async (conversationId: string) => {
    setIsExtracting(true)

    try {
      // Extract profile from conversation
      const extractResponse = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      })

      if (!extractResponse.ok) {
        throw new Error('Extraction failed')
      }

      // Mark onboarding as completed
      const completeResponse = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      })

      if (!completeResponse.ok) {
        throw new Error('Failed to complete onboarding')
      }

      // Redirect to dashboard
      window.location.href = '/dashboard'
    } catch (error) {
      console.error('[Onboarding] Error completing:', error)
      setIsExtracting(false)
      // Still redirect on error - user can use the app
      window.location.href = '/dashboard'
    }
  }

  if (isExtracting) {
    return (
      <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Przygotowuję Twój profil...
          </h2>
          <p className="text-slate-400">
            Analizuję naszą rozmowę i tworzę spersonalizowany system.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (mode === 'select') {
    return (
      <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white mb-3">
              Cześć! Jestem ExoSkull.
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed">
              Twój osobisty drugi mózg. Zanim zaczniemy - chcę Cię poznać.
              Porozmawiajmy przez chwilę.
            </p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={() => setMode('voice')}
              className="w-full h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mic className="w-6 h-6 mr-3" />
              Porozmawiajmy głosowo
            </Button>

            <Button
              onClick={() => setMode('chat')}
              variant="outline"
              className="w-full h-14 text-base border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Wolę pisać
            </Button>
          </div>

          <p className="text-slate-500 text-sm text-center mt-6">
            Rozmowa potrwa około 10-15 minut. <br />
            Wszystko zostaje między nami.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (mode === 'voice') {
    return (
      <DiscoveryVoice
        onComplete={handleComplete}
        onBack={() => setMode('select')}
      />
    )
  }

  if (mode === 'chat') {
    return (
      <DiscoveryChat
        onComplete={handleComplete}
        onBack={() => setMode('select')}
      />
    )
  }

  return null
}
