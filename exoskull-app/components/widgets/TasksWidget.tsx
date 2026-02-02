'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { TaskStats } from '@/lib/dashboard/types'
import Link from 'next/link'

interface TasksWidgetProps {
  stats: TaskStats
  loading?: boolean
}

export function TasksWidget({ stats, loading }: TasksWidgetProps) {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Zadania
          </span>
          <Link
            href="/dashboard/tasks"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Zobacz wszystkie
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-4">
          {stats.done}/{stats.total}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({completionRate}%)
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
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
        </div>
      </CardContent>
    </Card>
  )
}
