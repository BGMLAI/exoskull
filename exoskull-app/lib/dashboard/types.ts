export interface DataPoint {
  date: string
  value: number
  label?: string
}

export interface WidgetSummary {
  current: number | null
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
  average7d: number
  average30d?: number
}

export interface WidgetData {
  widgetId: string
  data: DataPoint[]
  summary: WidgetSummary
  lastUpdated: string
}

export interface UserTrackingPreferences {
  tracks_energy: boolean
  tracks_sleep: boolean
  tracks_mood: boolean
  tracks_stress: boolean
  tracks_focus: boolean
  tracks_productivity: boolean
  tracks_tasks: boolean
}

export interface TaskStats {
  total: number
  pending: number
  in_progress: number
  done: number
  blocked: number
}

export interface ConversationStats {
  totalToday: number
  totalWeek: number
  avgDuration: number
}
