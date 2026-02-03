'use client'

import { OnboardingForm } from '@/components/onboarding/OnboardingForm'

export default function OnboardingPage() {
  const handleComplete = () => {
    window.location.href = '/dashboard'
  }

  return <OnboardingForm onComplete={handleComplete} />
}
