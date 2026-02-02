'use client'

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DataPoint } from '@/lib/dashboard/types'

interface AreaChartWrapperProps {
  data: DataPoint[]
  dataKey?: string
  color?: string
  height?: number
  showGrid?: boolean
  showXAxis?: boolean
  showYAxis?: boolean
}

export function AreaChartWrapper({
  data,
  dataKey = 'value',
  color = '#3b82f6',
  height = 120,
  showGrid = false,
  showXAxis = false,
  showYAxis = false
}: AreaChartWrapperProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        Brak danych
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        {showXAxis && (
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#888' }}
          />
        )}
        {showYAxis && (
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#888' }}
            width={30}
          />
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const point = payload[0].payload as DataPoint
              return (
                <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
                  <p className="font-medium">{point.value}</p>
                  <p className="text-muted-foreground text-xs">{point.label || point.date}</p>
                </div>
              )
            }
            return null
          }}
        />
        <defs>
          <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${color.replace('#', '')})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
