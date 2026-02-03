'use client'

import { useEffect, useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  ComposedChart,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface HRVDataPoint {
  date: string
  value: number // ms
  label?: string
}

interface HRVChartProps {
  days?: 7 | 14 | 30
}

export function HRVChart({ days = 7 }: HRVChartProps) {
  const [data, setData] = useState<HRVDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/health/metrics?type=hrv&days=${days}`)
        if (!response.ok) {
          throw new Error('Failed to fetch HRV data')
        }
        const result = await response.json()

        // Calculate baseline (average) for reference band
        const values = result.data.map((p: HRVDataPoint) => p.value).filter((v: number) => v > 0)
        const baseline = values.length > 0
          ? values.reduce((a: number, b: number) => a + b, 0) / values.length
          : 0

        const chartData = result.data.map((point: HRVDataPoint) => ({
          ...point,
          label: formatDateLabel(point.date),
          baseline,
          // Reference band: baseline +/- 15%
          upper: baseline * 1.15,
          lower: baseline * 0.85,
        }))

        setData(chartData)
        setError(null)
      } catch (err) {
        console.error('[HRVChart] Error:', err)
        setError('Nie udalo sie zaladowac danych')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [days])

  // Calculate stats
  const hasData = data.some(d => d.value > 0)
  const validData = data.filter(d => d.value > 0)
  const avgHRV = hasData
    ? Math.round(validData.reduce((sum, d) => sum + d.value, 0) / validData.length)
    : 0
  const latestHRV = validData.length > 0 ? validData[validData.length - 1].value : 0

  // Trend calculation
  const recentAvg =
    data.slice(-3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value, 0) /
    (data.slice(-3).filter(d => d.value > 0).length || 1)
  const previousAvg =
    data.slice(-6, -3).filter(d => d.value > 0).reduce((sum, d) => sum + d.value, 0) /
    (data.slice(-6, -3).filter(d => d.value > 0).length || 1)
  const trend = recentAvg > previousAvg * 1.05 ? 'up' : recentAvg < previousAvg * 0.95 ? 'down' : 'stable'

  // Recovery interpretation
  const getRecoveryStatus = (hrv: number, baseline: number) => {
    if (hrv === 0) return { text: 'Brak danych', color: 'text-muted-foreground' }
    const ratio = hrv / baseline
    if (ratio >= 1.1) return { text: 'Swietna regeneracja', color: 'text-green-500' }
    if (ratio >= 0.95) return { text: 'Dobra regeneracja', color: 'text-blue-500' }
    if (ratio >= 0.85) return { text: 'Regeneracja w normie', color: 'text-yellow-500' }
    return { text: 'Potrzebny odpoczynek', color: 'text-red-500' }
  }

  const recoveryStatus = getRecoveryStatus(latestHRV, avgHRV)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            <CardTitle className="text-lg">HRV</CardTitle>
          </div>
          {hasData && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm">
                {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
                <span className="text-muted-foreground">
                  sr. {avgHRV}ms
                </span>
              </div>
            </div>
          )}
        </div>
        <CardDescription className="flex items-center justify-between">
          <span>Ostatnie {days} dni</span>
          {hasData && (
            <span className={`text-xs ${recoveryStatus.color}`}>
              {recoveryStatus.text}
            </span>
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
            <div className="text-center">
              <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Brak danych HRV</p>
              <p className="text-xs mt-1">Polacz urzadzenie z pomiarem HRV</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="hrvBandGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
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
                width={35}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload
                    const status = getRecoveryStatus(point.value, point.baseline)
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="font-medium text-green-400">
                          {point.value}ms
                        </p>
                        <p className={`text-xs ${status.color}`}>
                          {status.text}
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                          Baseline: {Math.round(point.baseline)}ms
                        </p>
                        <p className="text-muted-foreground text-xs">{point.date}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              {/* Baseline reference band */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="url(#hrvBandGradient)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#1a1a1a"
                fillOpacity={1}
              />
              {/* Baseline line */}
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#22c55e"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                strokeOpacity={0.5}
              />
              {/* Actual HRV values */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
                activeDot={{ r: 5 }}
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
