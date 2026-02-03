'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Footprints, Target, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ActivityDataPoint {
  date: string
  value: number // steps
  label?: string
  average?: number
}

interface ActivityChartProps {
  days?: 7 | 14 | 30
  goal?: number
}

const DEFAULT_STEP_GOAL = 10000

export function ActivityChart({ days = 7, goal = DEFAULT_STEP_GOAL }: ActivityChartProps) {
  const [data, setData] = useState<ActivityDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/health/metrics?type=steps&days=${days}`)
        if (!response.ok) {
          throw new Error('Failed to fetch activity data')
        }
        const result = await response.json()

        // Calculate running average and format labels
        const values = result.data.map((p: ActivityDataPoint) => p.value).filter((v: number) => v > 0)
        const avgSteps = values.length > 0
          ? values.reduce((a: number, b: number) => a + b, 0) / values.length
          : 0

        const chartData = result.data.map((point: ActivityDataPoint) => ({
          ...point,
          label: formatDateLabel(point.date),
          average: avgSteps,
        }))

        setData(chartData)
        setError(null)
      } catch (err) {
        console.error('[ActivityChart] Error:', err)
        setError('Nie udalo sie zaladowac danych')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [days])

  // Calculate stats
  const hasData = data.some(d => d.value > 0)
  const totalSteps = data.reduce((sum, d) => sum + d.value, 0)
  const avgSteps = hasData
    ? Math.round(data.filter(d => d.value > 0).reduce((sum, d) => sum + d.value, 0) /
      data.filter(d => d.value > 0).length)
    : 0
  const daysAtGoal = data.filter(d => d.value >= goal).length

  // Trend calculation
  const recentAvg =
    data.slice(-3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value, 0) /
    (data.slice(-3).filter(d => d.value > 0).length || 1)
  const previousAvg =
    data.slice(-6, -3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value, 0) /
    (data.slice(-6, -3).filter(d => d.value > 0).length || 1)
  const trend = recentAvg > previousAvg * 1.1 ? 'up' : recentAvg < previousAvg * 0.9 ? 'down' : 'stable'

  // Get bar color based on goal achievement
  const getBarColor = (value: number) => {
    if (value >= goal) return '#22c55e' // green - goal met
    if (value >= goal * 0.7) return '#eab308' // yellow - close
    if (value > 0) return '#ef4444' // red - low
    return '#374151' // gray - no data
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Aktywnosc</CardTitle>
          </div>
          {hasData && (
            <div className="flex items-center gap-1 text-sm">
              {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
              {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
              {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
              <span className="text-muted-foreground">
                sr. {avgSteps.toLocaleString()}
              </span>
            </div>
          )}
        </div>
        <CardDescription className="flex items-center gap-2">
          <span>Ostatnie {days} dni</span>
          {hasData && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {daysAtGoal}/{days} dni
              </span>
            </>
          )}
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
            Brak danych o aktywnosci
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                width={40}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload
                    const percentOfGoal = Math.round((point.value / goal) * 100)
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="font-medium text-blue-400">
                          {point.value.toLocaleString()} krokow
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {percentOfGoal}% celu ({goal.toLocaleString()})
                        </p>
                        <p className="text-muted-foreground text-xs">{point.date}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <ReferenceLine
                y={goal}
                stroke="#22c55e"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
              <Bar
                dataKey="value"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={30}
              />
              <Line
                type="monotone"
                dataKey="average"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </ComposedChart>
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
