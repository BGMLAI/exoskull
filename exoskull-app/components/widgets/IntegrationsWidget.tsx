'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plug, Check, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface RigConnection {
  rig_slug: string
  sync_status: 'pending' | 'syncing' | 'success' | 'error'
  last_sync_at: string | null
  metadata: Record<string, unknown>
}

interface RigInfo {
  slug: string
  name: string
  icon: string
  description: string
}

// Main integrations to show
const FEATURED_RIGS: RigInfo[] = [
  {
    slug: 'google',
    name: 'Google',
    icon: '🌐',
    description: 'Fit, Gmail, Calendar, Drive, YouTube, Photos',
  },
  {
    slug: 'microsoft-365',
    name: 'Microsoft 365',
    icon: '🟦',
    description: 'Outlook, Calendar, OneDrive, Teams',
  },
  {
    slug: 'notion',
    name: 'Notion',
    icon: '📓',
    description: 'Bazy danych i notatki',
  },
  {
    slug: 'todoist',
    name: 'Todoist',
    icon: '✅',
    description: 'Zadania i projekty',
  },
]

interface IntegrationsWidgetProps {
  connections?: RigConnection[]
  loading?: boolean
}

export function IntegrationsWidget({ connections = [], loading }: IntegrationsWidgetProps) {
  const [connectionsMap, setConnectionsMap] = useState<Map<string, RigConnection>>(new Map())
  const [syncing, setSyncing] = useState<string | null>(null)

  useEffect(() => {
    const map = new Map<string, RigConnection>()
    connections.forEach((conn) => {
      map.set(conn.rig_slug, conn)
    })
    setConnectionsMap(map)
  }, [connections])

  const handleConnect = (slug: string) => {
    // Redirect to OAuth flow
    window.location.href = `/api/rigs/${slug}/connect`
  }

  const handleSync = async (slug: string) => {
    setSyncing(slug)
    try {
      const response = await fetch(`/api/rigs/${slug}/sync`, { method: 'POST' })
      if (response.ok) {
        // Refresh the page to show updated data
        window.location.reload()
      }
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setSyncing(null)
    }
  }

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Nigdy'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Przed chwilą'
    if (diffMins < 60) return `${diffMins} min temu`
    if (diffHours < 24) return `${diffHours}h temu`
    return `${diffDays}d temu`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integracje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const connectedCount = FEATURED_RIGS.filter((rig) => connectionsMap.has(rig.slug)).length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integracje
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {connectedCount}/{FEATURED_RIGS.length} połączonych
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {FEATURED_RIGS.map((rig) => {
          const connection = connectionsMap.get(rig.slug)
          const isConnected = !!connection && connection.sync_status !== 'error'
          const hasError = connection?.sync_status === 'error'
          const isSyncing = syncing === rig.slug || connection?.sync_status === 'syncing'

          return (
            <div
              key={rig.slug}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{rig.icon}</span>
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    {rig.name}
                    {isConnected && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {hasError && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected
                      ? `Ostatni sync: ${formatLastSync(connection?.last_sync_at ?? null)}`
                      : rig.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSync(rig.slug)}
                      disabled={isSyncing}
                      className="h-8 px-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(rig.slug)}
                      className="h-8"
                    >
                      Reconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleConnect(rig.slug)}
                    className="h-8"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Połącz
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        <a
          href="/dashboard/marketplace"
          className="block text-center text-sm text-muted-foreground hover:text-foreground pt-2"
        >
          Zobacz wszystkie integracje →
        </a>
      </CardContent>
    </Card>
  )
}
