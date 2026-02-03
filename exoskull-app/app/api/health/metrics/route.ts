import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Valid metric types for health data
const VALID_METRIC_TYPES = ['sleep', 'steps', 'hrv', 'heart_rate', 'calories', 'distance', 'active_minutes'] as const
type MetricType = typeof VALID_METRIC_TYPES[number]

// Valid day ranges
const VALID_DAYS = [7, 14, 30] as const

interface MetricDataPoint {
  date: string
  value: number
  unit?: string
}

/**
 * GET /api/health/metrics
 * Fetch time-series health data for charts
 *
 * Query params:
 * - type: sleep|steps|hrv|heart_rate|calories|distance|active_minutes
 * - days: 7|14|30 (default: 7)
 *
 * Returns: Array of { date, value } formatted for Recharts
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const metricType = searchParams.get('type') as MetricType | null
    const daysParam = searchParams.get('days')
    const days = daysParam ? parseInt(daysParam, 10) : 7

    // Validate metric type
    if (!metricType || !VALID_METRIC_TYPES.includes(metricType)) {
      return NextResponse.json(
        {
          error: 'Invalid metric type',
          valid_types: VALID_METRIC_TYPES
        },
        { status: 400 }
      )
    }

    // Validate days
    if (!VALID_DAYS.includes(days as typeof VALID_DAYS[number])) {
      return NextResponse.json(
        {
          error: 'Invalid days parameter',
          valid_days: VALID_DAYS
        },
        { status: 400 }
      )
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Query health metrics grouped by day
    // Using MAX for cumulative metrics (steps), SUM for duration (sleep minutes)
    const aggregation = metricType === 'sleep' ? 'SUM' : 'MAX'

    const { data, error } = await supabase
      .from('exo_health_metrics')
      .select('value, unit, recorded_at')
      .eq('tenant_id', user.id)
      .eq('metric_type', metricType)
      .gte('recorded_at', startDate.toISOString())
      .lte('recorded_at', endDate.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('[HealthMetrics] Query error:', {
        error: error.message,
        metricType,
        userId: user.id
      })
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      )
    }

    // Aggregate by day (client-side aggregation since Supabase doesn't support GROUP BY easily)
    const dailyData: Record<string, { values: number[], unit: string }> = {}

    for (const row of data || []) {
      const dateKey = new Date(row.recorded_at).toISOString().split('T')[0]
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { values: [], unit: row.unit || '' }
      }
      dailyData[dateKey].values.push(row.value)
    }

    // Apply aggregation and format for Recharts
    const chartData: MetricDataPoint[] = Object.entries(dailyData)
      .map(([date, { values, unit }]) => {
        let aggregatedValue: number

        if (metricType === 'sleep') {
          // Sleep: sum minutes
          aggregatedValue = values.reduce((a, b) => a + b, 0)
        } else if (metricType === 'hrv' || metricType === 'heart_rate') {
          // HRV/HR: average
          aggregatedValue = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        } else {
          // Steps, calories, distance: max (cumulative counter)
          aggregatedValue = Math.max(...values)
        }

        return {
          date,
          value: aggregatedValue,
          unit
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    // Fill missing days with null/0 for continuous chart
    const filledData = fillMissingDays(chartData, startDate, endDate)

    return NextResponse.json({
      metric_type: metricType,
      days,
      data: filledData,
      count: filledData.length,
      range: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      }
    })

  } catch (error) {
    console.error('[HealthMetrics] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Fill missing days with value: 0 for continuous chart display
 */
function fillMissingDays(
  data: MetricDataPoint[],
  startDate: Date,
  endDate: Date
): MetricDataPoint[] {
  const dataByDate = new Map(data.map(d => [d.date, d]))
  const result: MetricDataPoint[] = []

  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0]
    const existing = dataByDate.get(dateStr)

    if (existing) {
      result.push(existing)
    } else {
      result.push({ date: dateStr, value: 0 })
    }

    current.setDate(current.getDate() + 1)
  }

  return result
}
