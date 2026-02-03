'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Moon, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SleepDataPoint {
  date: string
  value: number // minutes
  label?: string
}

interface SleepChartProps {
  days?: 7 | 14 | 30
}

export function SleepChart({ days = 7 }: SleepChartProps) {
  const [data, setData] = useState<SleepDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/health/metrics?type=sleep&days=${days}`)
        if (!response.ok) {
          throw new Error('Failed to fetch sleep data')
        }
        const result = await response.json()

        // Convert minutes to hours and format labels
        const chartData = result.data.map((point: SleepDataPoint) => ({
          ...point,
          hours: point.value / 60,
          label: formatDateLabel(point.date),
        }))

        setData(chartData)
        setError(null)
      } catch (err) {
        console.error('[SleepChart] Error:', err)
        setError('Nie udalo sie zaladowac danych')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [days])

  // Calculate stats
  const hasData = data.some(d => d.value > 0)
  const avgHours = hasData
    ? data.filter(d => d.value > 0).reduce((sum, d) => sum + d.value / 60, 0) /
      data.filter(d => d.value > 0).length
    : 0

  // Trend: compare last 3 days vs previous 3 days
  const recentAvg =
    data.slice(-3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value / 60, 0) /
    (data.slice(-3).filter(d => d.value > 0).length || 1)
  const previousAvg =
    data.slice(-6, -3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value / 60, 0) /
    (data.slice(-6, -3).filter(d => d.value > 0).length || 1)
  const trend = recentAvg > previousAvg + 0.5 ? 'up' : recentAvg < previousAvg - 0.5 ? 'down' : 'stable'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg">Sen</CardTitle>
          </div>
          {hasData && (
            <div className="flex items-center gap-1 text-sm">
              {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
              {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
              {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
              <span className="text-muted-foreground">
                sr. {avgHours.toFixed(1)}h
              </span>
            </div>
          )}
        </div>
        <CardDescription>
          Ostatnie {days} dni
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground">
            Ladowanie...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[180px] text-red-500 text-sm">
            {error}
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
            Brak danych o snie
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="sleepGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#888' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#888' }}
                width={30}
                domain={[0, 12]}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload
                    const hours = Math.floor(point.value / 60)
                    const minutes = point.value % 60
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="font-medium text-purple-400">
                          {hours}h {minutes}min
                        </p>
                        <p className="text-muted-foreground text-xs">{point.date}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#sleepGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate()
  const month = date.toLocaleDateString('pl-PL', { month: 'short' })
  return `${day} ${month}`
}
