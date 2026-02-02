'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Clock, TrendingUp } from 'lucide-react'
import { ConversationStats } from '@/lib/dashboard/types'
import Link from 'next/link'

interface ConversationsWidgetProps {
  stats: ConversationStats
  loading?: boolean
}

export function ConversationsWidget({ stats, loading }: ConversationsWidgetProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Rozmowy
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

  const avgMinutes = Math.round(stats.avgDuration / 60)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Rozmowy
          </span>
          <Link
            href="/dashboard/voice"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Rozpocznij rozmowe
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-4">
          {stats.totalWeek}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            w tym tygodniu
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span>{stats.totalToday} dzis</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-blue-500" />
            <span>~{avgMinutes} min/rozmowa</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
