// =====================================================
// GOALS & SUCCESS METRICS - Types
// Layer 9: Self-Defining Success Metrics
// =====================================================

export type GoalCategory =
  | "health"
  | "productivity"
  | "finance"
  | "mental"
  | "social"
  | "learning"
  | "creativity";

export type GoalTargetType = "numeric" | "boolean" | "frequency";

export type GoalDirection = "increase" | "decrease";

export type GoalFrequency = "daily" | "weekly" | "monthly";

export type Momentum = "up" | "down" | "stable";

export type Trajectory = "on_track" | "at_risk" | "off_track" | "completed";

export interface MeasurableProxy {
  source: string; // table name: "activity_entries", "sleep_entries", "mood_entries", etc.
  field: string; // column: "duration", "quality", "mood_value", etc.
  aggregation: "sum" | "avg" | "count" | "max" | "min" | "latest";
  filter?: Record<string, string>; // e.g., { activity_type: "running" }
}

export interface UserGoal {
  id: string;
  tenant_id: string;
  name: string;
  category: GoalCategory;
  description?: string;
  target_type: GoalTargetType;
  target_value?: number;
  target_unit?: string;
  baseline_value?: number;
  current_value?: number;
  frequency: GoalFrequency;
  direction: GoalDirection;
  start_date: string;
  target_date?: string;
  is_active: boolean;
  measurable_proxies: MeasurableProxy[];
  wellbeing_weight: number;
  created_at: string;
  updated_at: string;
}

export interface GoalCheckpoint {
  id: string;
  tenant_id: string;
  goal_id: string;
  checkpoint_date: string;
  value: number;
  data_source: string;
  progress_percent?: number;
  momentum: Momentum;
  trajectory: Trajectory;
  notes?: string;
  created_at: string;
}

export interface GoalInput {
  name: string;
  category?: GoalCategory;
  description?: string;
  target_value?: number;
  target_unit?: string;
  baseline_value?: number;
  frequency?: GoalFrequency;
  direction?: GoalDirection;
  target_date?: string;
}

export interface GoalStatus {
  goal: UserGoal;
  progress_percent: number;
  momentum: Momentum;
  trajectory: Trajectory;
  days_remaining: number | null;
  forecast_date: string | null;
  last_checkpoint?: GoalCheckpoint;
  streak_days: number;
}
