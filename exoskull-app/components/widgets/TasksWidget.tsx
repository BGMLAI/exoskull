'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare, Clock, AlertCircle, CheckCircle, Minus } from 'lucide-react'
import { TaskStats, DataPoint } from '@/lib/dashboard/types'
import Link from 'next/link'
import { AreaChartWrapper } from '@/components/charts/AreaChartWrapper'

interface TasksWidgetProps {
  stats: TaskStats
  series?: DataPoint[]
  lastUpdated?: string | null
  loading?: boolean
}

export function TasksWidget({ stats, series = [], lastUpdated, loading }: TasksWidgetProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Zadania
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const completionRate = stats.total > 0
    ? Math.round((stats.done / stats.total) * 100)
    : 0

  const hasSeries = series.some((point) => point.value > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Zadania
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Aktualizacja: {formatTime(lastUpdated)}
              </span>
            )}
            <Link
              href="/dashboard/tasks"
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              Zobacz wszystkie
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold mb-2">
            {stats.done}/{stats.total}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({completionRate}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-yellow-500" />
            <span>{stats.pending} oczekuje</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-blue-500" />
            <span>{stats.in_progress} w toku</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>{stats.done} gotowe</span>
          </div>
          <div className="flex items-center gap-1">
            <Minus className="h-3 w-3 text-red-500" />
            <span>{stats.blocked} blokady</span>
          </div>
        </div>

        {hasSeries && (
          <AreaChartWrapper
            data={series}
            color="#22c55e"
            height={80}
            showXAxis
          />
        )}
      </CardContent>
    </Card>
  )
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}
