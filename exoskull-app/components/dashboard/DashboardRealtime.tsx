'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TasksWidget } from '@/components/widgets/TasksWidget'
import { ConversationsWidget } from '@/components/widgets/ConversationsWidget'
import { ConversationStats, DataPoint, TaskStats } from '@/lib/dashboard/types'

interface DashboardRealtimeProps {
  tenantId: string
  initialTaskStats: TaskStats
  initialConversationStats: ConversationStats
  initialTaskSeries: DataPoint[]
  initialConversationSeries: DataPoint[]
}

export function DashboardRealtime({
  tenantId,
  initialTaskStats,
  initialConversationStats,
  initialTaskSeries,
  initialConversationSeries,
}: DashboardRealtimeProps) {
  const supabase = createClient()
  const [taskStats, setTaskStats] = useState<TaskStats>(initialTaskStats)
  const [conversationStats, setConversationStats] = useState<ConversationStats>(initialConversationStats)
  const [taskSeries, setTaskSeries] = useState<DataPoint[]>(initialTaskSeries)
  const [conversationSeries, setConversationSeries] = useState<DataPoint[]>(initialConversationSeries)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const refreshTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('exo_tasks')
      .select('status, completed_at')
      .eq('tenant_id', tenantId)

    if (error || !data) return

    const stats: TaskStats = {
      total: data.length,
      pending: data.filter((t) => t.status === 'pending').length,
      in_progress: data.filter((t) => t.status === 'in_progress').length,
      done: data.filter((t) => t.status === 'done').length,
      blocked: data.filter((t) => t.status === 'blocked').length,
    }

    const completedDates = data
      .filter((t) => t.completed_at)
      .map((t) => t.completed_at as string)

    setTaskStats(stats)
    setTaskSeries(buildDailySeries(completedDates, 7))
    setLastUpdated(new Date().toISOString())
  }, [supabase, tenantId])

  const refreshConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('exo_conversations')
      .select('started_at, duration_seconds')
      .eq('tenant_id', tenantId)

    if (error || !data) return

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now)
    startOfWeek.setDate(startOfWeek.getDate() - 7)

    const todayConvs = data.filter((c) => new Date(c.started_at) >= startOfDay)
    const weekConvs = data.filter((c) => new Date(c.started_at) >= startOfWeek)
    const durations = data
      .filter((c) => c.duration_seconds)
      .map((c) => c.duration_seconds as number)

    const stats: ConversationStats = {
      totalToday: todayConvs.length,
      totalWeek: weekConvs.length,
      avgDuration: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    }

    const startedDates = data.map((c) => c.started_at as string)

    setConversationStats(stats)
    setConversationSeries(buildDailySeries(startedDates, 7))
    setLastUpdated(new Date().toISOString())
  }, [supabase, tenantId])

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exo_tasks', filter: `tenant_id=eq.${tenantId}` },
        () => refreshTasks()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exo_conversations', filter: `tenant_id=eq.${tenantId}` },
        () => refreshConversations()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, tenantId, refreshTasks, refreshConversations])

  return (
    <>
      <TasksWidget stats={taskStats} series={taskSeries} lastUpdated={lastUpdated} />
      <ConversationsWidget stats={conversationStats} series={conversationSeries} lastUpdated={lastUpdated} />
    </>
  )
}

function buildDailySeries(dateStrings: string[], days: number): DataPoint[] {
  const counts = new Map<string, number>()
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)

  dateStrings.forEach((dateStr) => {
    const date = new Date(dateStr)
    if (date < start) return
    const key = date.toISOString().split('T')[0]
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  const series: DataPoint[] = []
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const key = date.toISOString().split('T')[0]
    series.push({
      date: key,
      value: counts.get(key) || 0,
      label: formatShortDate(date),
    })
  }

  return series
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  })
}
