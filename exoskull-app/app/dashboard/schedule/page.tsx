'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Clock, Settings, Calendar, Phone, MessageSquare, CheckCircle, XCircle, AlertCircle, Play, Plus, Pencil, Trash2 } from 'lucide-react'
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

interface CustomJob {
  id: string
  job_name: string
  display_name: string
  description: string | null
  schedule_type: 'daily' | 'weekly' | 'monthly'
  time_of_day: string
  days_of_week: number[] | null
  day_of_month: number | null
  channel: 'voice' | 'sms'
  message_template: string | null
  job_type: string
  is_enabled: boolean
  next_execution_at: string | null
  created_at: string
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

const DAYS_OF_WEEK = [
  { value: 0, label: 'Niedziela' },
  { value: 1, label: 'Poniedzialek' },
  { value: 2, label: 'Wtorek' },
  { value: 3, label: 'Sroda' },
  { value: 4, label: 'Czwartek' },
  { value: 5, label: 'Piatek' },
  { value: 6, label: 'Sobota' },
]

export default function SchedulePage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [customJobs, setCustomJobs] = useState<CustomJob[]>([])
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)
  const [recentLogs, setRecentLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  // Custom job dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingCustomJob, setEditingCustomJob] = useState<CustomJob | null>(null)
  const [formData, setFormData] = useState({
    display_name: '',
    description: '',
    schedule_type: 'daily' as 'daily' | 'weekly' | 'monthly',
    time_of_day: '09:00',
    days_of_week: [] as number[],
    day_of_month: 1,
    channel: 'sms' as 'voice' | 'sms',
    message_template: ''
  })

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

      // Fetch schedule data (system jobs)
      const response = await fetch(`/api/schedule?tenant_id=${tenant_id}`)
      const data = await response.json()

      if (data.error) {
        setError(data.error)
      } else {
        setJobs(data.jobs || [])
        setGlobalSettings(data.global_settings || null)
        setRecentLogs(data.recent_logs || [])
      }

      // Fetch custom jobs
      const customResponse = await fetch(`/api/schedule/custom?tenant_id=${tenant_id}`)
      const customData = await customResponse.json()

      if (!customData.error) {
        setCustomJobs(customData.jobs || [])
      }
    } catch (e) {
      console.error('[SchedulePage] Error:', e)
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
      console.error('[ToggleJob] Failed:', e)
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
        fetchScheduleData()
      } else {
        alert(`Blad: ${result.error || 'Nieznany blad'}`)
      }
    } catch (e) {
      console.error('[TriggerJob] Failed:', e)
    } finally {
      setUpdating(null)
    }
  }

  // Custom job functions
  const resetForm = () => {
    setFormData({
      display_name: '',
      description: '',
      schedule_type: 'daily',
      time_of_day: '09:00',
      days_of_week: [],
      day_of_month: 1,
      channel: 'sms',
      message_template: ''
    })
  }

  const openEditDialog = (job: CustomJob) => {
    setFormData({
      display_name: job.display_name,
      description: job.description || '',
      schedule_type: job.schedule_type,
      time_of_day: job.time_of_day.slice(0, 5),
      days_of_week: job.days_of_week || [],
      day_of_month: job.day_of_month || 1,
      channel: job.channel,
      message_template: job.message_template || ''
    })
    setEditingCustomJob(job)
  }

  const createCustomJob = async () => {
    if (!tenantId || !formData.display_name) return

    try {
      const response = await fetch('/api/schedule/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_name: formData.display_name.toLowerCase().replace(/\s+/g, '_'),
          display_name: formData.display_name,
          description: formData.description || null,
          schedule_type: formData.schedule_type,
          time_of_day: formData.time_of_day + ':00',
          days_of_week: formData.schedule_type === 'weekly' ? formData.days_of_week : null,
          day_of_month: formData.schedule_type === 'monthly' ? formData.day_of_month : null,
          channel: formData.channel,
          message_template: formData.message_template || null
        })
      })

      const result = await response.json()

      if (result.success) {
        setIsCreateDialogOpen(false)
        resetForm()
        fetchScheduleData()
      } else {
        alert(`Blad: ${result.error || 'Nie udalo sie utworzyc harmonogramu'}`)
      }
    } catch (e) {
      console.error('[CreateCustomJob] Failed:', e)
      alert('Nie udalo sie utworzyc harmonogramu')
    }
  }

  const updateCustomJob = async () => {
    if (!tenantId || !editingCustomJob) return

    try {
      const response = await fetch('/api/schedule/custom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_id: editingCustomJob.id,
          updates: {
            display_name: formData.display_name,
            description: formData.description || null,
            schedule_type: formData.schedule_type,
            time_of_day: formData.time_of_day + ':00',
            days_of_week: formData.schedule_type === 'weekly' ? formData.days_of_week : null,
            day_of_month: formData.schedule_type === 'monthly' ? formData.day_of_month : null,
            channel: formData.channel,
            message_template: formData.message_template || null
          }
        })
      })

      const result = await response.json()

      if (result.success) {
        setEditingCustomJob(null)
        resetForm()
        fetchScheduleData()
      } else {
        alert(`Blad: ${result.error || 'Nie udalo sie zaktualizowac harmonogramu'}`)
      }
    } catch (e) {
      console.error('[UpdateCustomJob] Failed:', e)
      alert('Nie udalo sie zaktualizowac harmonogramu')
    }
  }

  const deleteCustomJob = async (jobId: string) => {
    if (!tenantId || !confirm('Czy na pewno chcesz usunac ten harmonogram?')) return

    try {
      const response = await fetch(`/api/schedule/custom?tenant_id=${tenantId}&job_id=${jobId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        fetchScheduleData()
      } else {
        alert(`Blad: ${result.error || 'Nie udalo sie usunac harmonogramu'}`)
      }
    } catch (e) {
      console.error('[DeleteCustomJob] Failed:', e)
      alert('Nie udalo sie usunac harmonogramu')
    }
  }

  const toggleCustomJob = async (job: CustomJob) => {
    if (!tenantId) return
    setUpdating(job.id)

    try {
      const response = await fetch('/api/schedule/custom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_id: job.id,
          updates: { is_enabled: !job.is_enabled }
        })
      })

      if (response.ok) {
        setCustomJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, is_enabled: !j.is_enabled } : j
        ))
      }
    } catch (e) {
      console.error('[ToggleCustomJob] Failed:', e)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Harmonogram</h1>
          <p className="text-muted-foreground">
            Zarzadzaj automatycznymi check-inami i powiadomieniami
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nowy harmonogram
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Nowy harmonogram</DialogTitle>
              <DialogDescription>
                Utworz wlasne przypomnienie lub check-in
              </DialogDescription>
            </DialogHeader>
            <CustomJobForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={createCustomJob}
              onCancel={() => {
                setIsCreateDialogOpen(false)
                resetForm()
              }}
            />
          </DialogContent>
        </Dialog>
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

      {/* Custom Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Twoje harmonogramy
          </CardTitle>
          <CardDescription>
            Wlasne przypomnienia i check-iny
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {customJobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Brak wlasnych harmonogramow. Kliknij &quot;Nowy harmonogram&quot; aby dodac.
            </p>
          ) : (
            customJobs.map(job => (
              <CustomJobCard
                key={job.id}
                job={job}
                onToggle={() => toggleCustomJob(job)}
                onEdit={() => openEditDialog(job)}
                onDelete={() => deleteCustomJob(job.id)}
                isUpdating={updating === job.id}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* User Jobs (pre-defined) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Systemowe check-iny
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

      {/* Edit Custom Job Dialog */}
      {editingCustomJob && (
        <Dialog open={!!editingCustomJob} onOpenChange={() => setEditingCustomJob(null)}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Edytuj harmonogram</DialogTitle>
              <DialogDescription>
                Zaktualizuj ustawienia harmonogramu
              </DialogDescription>
            </DialogHeader>
            <CustomJobForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={updateCustomJob}
              onCancel={() => {
                setEditingCustomJob(null)
                resetForm()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// Custom Job Form Component
function CustomJobForm({
  formData,
  setFormData,
  onSubmit,
  onCancel
}: {
  formData: any
  setFormData: any
  onSubmit: () => void
  onCancel: () => void
}) {
  const toggleDayOfWeek = (day: number) => {
    const current = formData.days_of_week || []
    if (current.includes(day)) {
      setFormData({ ...formData, days_of_week: current.filter((d: number) => d !== day) })
    } else {
      setFormData({ ...formData, days_of_week: [...current, day].sort() })
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="display_name">Nazwa *</Label>
        <Input
          id="display_name"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          placeholder="np. Poranne przypomnienie o wodzie"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Opis (opcjonalnie)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Co ma sprawdzac lub przypominac..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Czestotliwosc</Label>
          <Select
            value={formData.schedule_type}
            onValueChange={(value) => setFormData({ ...formData, schedule_type: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Codziennie</SelectItem>
              <SelectItem value="weekly">Co tydzien</SelectItem>
              <SelectItem value="monthly">Co miesiac</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="time">Godzina</Label>
          <Input
            id="time"
            type="time"
            value={formData.time_of_day}
            onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
          />
        </div>
      </div>

      {formData.schedule_type === 'weekly' && (
        <div className="space-y-2">
          <Label>Dni tygodnia</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map(day => (
              <Button
                key={day.value}
                type="button"
                variant={formData.days_of_week?.includes(day.value) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleDayOfWeek(day.value)}
              >
                {day.label.slice(0, 3)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {formData.schedule_type === 'monthly' && (
        <div className="space-y-2">
          <Label htmlFor="day_of_month">Dzien miesiaca</Label>
          <Input
            id="day_of_month"
            type="number"
            min="1"
            max="31"
            value={formData.day_of_month}
            onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) })}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Kanal</Label>
        <Select
          value={formData.channel}
          onValueChange={(value) => setFormData({ ...formData, channel: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="voice">Polaczenie glosowe</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message_template">Wiadomosc (opcjonalnie)</Label>
        <Textarea
          id="message_template"
          value={formData.message_template}
          onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
          placeholder="Tresc przypomnienia..."
          rows={2}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Anuluj
        </Button>
        <Button onClick={onSubmit} disabled={!formData.display_name}>
          Zapisz
        </Button>
      </DialogFooter>
    </div>
  )
}

// Custom Job Card Component
function CustomJobCard({
  job,
  onToggle,
  onEdit,
  onDelete,
  isUpdating
}: {
  job: CustomJob
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  isUpdating: boolean
}) {
  const scheduleText = () => {
    switch (job.schedule_type) {
      case 'daily':
        return 'Codziennie'
      case 'weekly':
        const days = job.days_of_week?.map(d => DAYS_OF_WEEK.find(dw => dw.value === d)?.label.slice(0, 3)).join(', ')
        return `Co tydzien: ${days || 'brak dni'}`
      case 'monthly':
        return `${job.day_of_month}. dnia miesiaca`
      default:
        return job.schedule_type
    }
  }

  return (
    <div className={cn(
      'flex items-center justify-between p-4 rounded-lg border',
      job.is_enabled ? 'bg-card' : 'bg-muted/30'
    )}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{job.display_name}</p>
          {job.is_enabled && (
            <Badge variant="default" className="text-xs">Aktywny</Badge>
          )}
        </div>
        {job.description && (
          <p className="text-sm text-muted-foreground">{job.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {job.time_of_day?.slice(0, 5)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {scheduleText()}
          </span>
          <span className="flex items-center gap-1">
            <ChannelIcon channel={job.channel} />
            {job.channel === 'voice' ? 'Glos' : 'SMS'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          title="Edytuj"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          title="Usun"
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
        <Button
          variant={job.is_enabled ? 'default' : 'outline'}
          size="sm"
          onClick={onToggle}
          disabled={isUpdating}
        >
          {isUpdating ? '...' : job.is_enabled ? 'Wylacz' : 'Wlacz'}
        </Button>
      </div>
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
