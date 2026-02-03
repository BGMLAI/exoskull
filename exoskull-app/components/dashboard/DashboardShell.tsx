'use client'

import { VoiceInterface } from '@/components/voice/VoiceInterface'

interface DashboardShellProps {
  children: React.ReactNode
  tenantId: string
}

export function DashboardShell({ children, tenantId }: DashboardShellProps) {
  return (
    <>
      {children}
      <VoiceInterface tenantId={tenantId} position="fixed" />
    </>
  )
}
