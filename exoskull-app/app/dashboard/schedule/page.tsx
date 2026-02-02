'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, Settings, Calendar, Phone, MessageSquare, CheckCircle, XCircle, AlertCircle, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScheduledJob {
  id: string
  job_name: string
  display_name: string
  description: string
  cron_expression: string
  time_window_start: string
  time_window_end: string
  default_channel: string
  is_system: boolean
  requires_user_consent: boolean
  user_preference: {
    is_enabled: boolean
    custom_time: string | null
    preferred_channel: string | null
    skip_weekends: boolean
  }
}

interface GlobalSettings {
  timezone: string
  language: string
  notification_channels?: {
    voice: boolean
    sms: boolean
  }
  rate_limits?: {
    max_calls_per_day: number
    max_sms_per_day: number
  }
  quiet_hours?: {
    start: string
    end: string
  }
  skip_weekends?: boolean
}

interface ExecutionLog {
  job_name: string
  status: string
  channel_used: string
  created_at: string
}

export default function SchedulePage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)
  const [recentLogs, setRecentLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchScheduleData = useCallback(async () => {
    try {
      // First get tenant_id from conversations API
      const convResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { check_only: true } })
      })
      const { tenant_id } = await convResponse.json()
      setTenantId(tenant_id)

      if (!tenant_id) {
        setError('Nie znaleziono uzytkownika')
        setLoading(false)
        return
      }

      // Fetch schedule data
      const response = await fetch(`/api/schedule?tenant_id=${tenant_id}`)
      const data = await response.json()

      if (data.error) {
        setError(data.error)
      } else {
        setJobs(data.jobs || [])
        setGlobalSettings(data.global_settings || null)
        setRecentLogs(data.recent_logs || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nieznany blad')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchScheduleData()
  }, [fetchScheduleData])

  const toggleJob = async (job: ScheduledJob) => {
    if (!tenantId) return
    setUpdating(job.id)

    try {
      const response = await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_id: job.id,
          preference: {
            is_enabled: !job.user_preference.is_enabled
          }
        })
      })

      if (response.ok) {
        setJobs(prev => prev.map(j =>
          j.id === job.id
            ? { ...j, user_preference: { ...j.user_preference, is_enabled: !j.user_preference.is_enabled }}
            : j
        ))
      }
    } catch (e) {
      console.error('Failed to toggle job:', e)
    } finally {
      setUpdating(null)
    }
  }

  const triggerJob = async (job: ScheduledJob) => {
    if (!tenantId) return
    setUpdating(job.id)

    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_name: job.job_name,
          channel: job.user_preference.preferred_channel || job.default_channel
        })
      })

      const result = await response.json()
      if (result.success) {
        // Refresh logs after trigger
        fetchScheduleData()
      } else {
        alert(`Blad: ${result.error || 'Nieznany blad'}`)
      }
    } catch (e) {
      console.error('Failed to trigger job:', e)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
        </div>
      </div>
    )
  }

  const systemJobs = jobs.filter(j => j.is_system)
  const userJobs = jobs.filter(j => !j.is_system)

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Harmonogram</h1>
        <p className="text-muted-foreground">
          Zarzadzaj automatycznymi check-inami i powiadomieniami
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Global Settings */}
      {globalSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Ustawienia globalne
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Strefa czasowa</p>
                <p className="font-medium">{globalSettings.timezone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Godziny ciszy</p>
                <p className="font-medium">
                  {globalSettings.quiet_hours
                    ? `${globalSettings.quiet_hours.start} - ${globalSettings.quiet_hours.end}`
                    : 'Nie ustawiono'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Limity dzienne</p>
                <p className="font-medium">
                  {globalSettings.rate_limits
                    ? `${globalSettings.rate_limits.max_calls_per_day} polaczen, ${globalSettings.rate_limits.max_sms_per_day} SMS`
                    : 'Domyslne'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Twoje check-iny
          </CardTitle>
          <CardDescription>
            Wlacz lub wylacz automatyczne przypomnienia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {userJobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Brak skonfigurowanych check-inow
            </p>
          ) : (
            userJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onToggle={() => toggleJob(job)}
                onTrigger={() => triggerJob(job)}
                isUpdating={updating === job.id}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* System Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-5 w-5" />
            Zadania systemowe
          </CardTitle>
          <CardDescription>
            Automatyczne procesy dzialajace w tle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {systemJobs.map(job => (
            <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">{job.display_name}</p>
                <p className="text-xs text-muted-foreground">{job.description}</p>
              </div>
              <Badge variant="secondary">System</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent Executions */}
      <Card>
        <CardHeader>
          <CardTitle>Ostatnie wykonania</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Brak historii wykonan
            </p>
          ) : (
            <div className="space-y-2">
              {recentLogs.slice(0, 10).map((log, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={log.status} />
                    <span className="font-medium">{log.job_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <ChannelIcon channel={log.channel_used} />
                    <span>{formatDate(log.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function JobCard({
  job,
  onToggle,
  onTrigger,
  isUpdating
}: {
  job: ScheduledJob
  onToggle: () => void
  onTrigger: () => void
  isUpdating: boolean
}) {
  const isEnabled = job.user_preference.is_enabled
  const channel = job.user_preference.preferred_channel || job.default_channel
  const time = job.user_preference.custom_time || job.time_window_start

  return (
    <div className={cn(
      'flex items-center justify-between p-4 rounded-lg border',
      isEnabled ? 'bg-card' : 'bg-muted/30'
    )}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{job.display_name}</p>
          {isEnabled && (
            <Badge variant="default" className="text-xs">Aktywny</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{job.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {time?.slice(0, 5) || 'Brak'}
          </span>
          <span className="flex items-center gap-1">
            <ChannelIcon channel={channel} />
            {channel === 'voice' ? 'Glos' : 'SMS'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onTrigger}
          disabled={isUpdating}
          title="Uruchom teraz"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant={isEnabled ? 'default' : 'outline'}
          size="sm"
          onClick={onToggle}
          disabled={isUpdating}
        >
          {isUpdating ? '...' : isEnabled ? 'Wylacz' : 'Wlacz'}
        </Button>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'skipped':
    case 'rate_limited':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-400" />
  }
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'voice') {
    return <Phone className="h-3 w-3" />
  }
  return <MessageSquare className="h-3 w-3" />
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}min temu`
  if (hours < 24) return `${hours}h temu`
  if (days < 7) return `${days}d temu`

  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short'
  })
}
