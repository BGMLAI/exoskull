export interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface WidgetSummary {
  current: number | null;
  trend: "up" | "down" | "stable";
  trendPercent: number;
  average7d: number;
  average30d?: number;
}

export interface WidgetData {
  widgetId: string;
  data: DataPoint[];
  summary: WidgetSummary;
  lastUpdated: string;
}

export interface UserTrackingPreferences {
  tracks_energy: boolean;
  tracks_sleep: boolean;
  tracks_mood: boolean;
  tracks_stress: boolean;
  tracks_focus: boolean;
  tracks_productivity: boolean;
  tracks_tasks: boolean;
}

export interface TaskStats {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  blocked: number;
}

export interface ConversationStats {
  totalToday: number;
  totalWeek: number;
  avgDuration: number;
}

export interface CalendarItem {
  id: string;
  title: string;
  date: string;
  type: "task" | "checkin" | "custom";
  link: string;
  meta?: string;
}

export interface HealthPrediction {
  metric: string;
  probability: number;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface HealthSummary {
  steps: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
  sleepSeries: DataPoint[];
  predictions?: HealthPrediction[];
}

export interface KnowledgeSummary {
  loopsTotal: number;
  activeCampaigns: number;
  topLoop?: {
    name: string;
    icon?: string | null;
    attentionScore?: number | null;
  };
}

export interface MiniSeriesData {
  label: string;
  data: DataPoint[];
}
