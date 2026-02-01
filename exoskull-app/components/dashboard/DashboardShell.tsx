'use client'

import { GlobalVoiceButton } from '@/components/voice/GlobalVoiceButton'

interface DashboardShellProps {
  children: React.ReactNode
  tenantId: string
}

export function DashboardShell({ children, tenantId }: DashboardShellProps) {
  return (
    <>
      {/* Global Voice Recording Button - always visible */}
      <GlobalVoiceButton tenantId={tenantId} />

      {/* Page content */}
      {children}
    </>
  )
}
