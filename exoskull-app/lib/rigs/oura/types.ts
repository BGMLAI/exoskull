// =====================================================
// OURA RING TYPES (Sleep, Activity, Readiness, HRV)
// =====================================================

export interface OuraSleepPeriod {
  id: string;
  average_breath: number;
  average_heart_rate: number;
  average_hrv: number;
  awake_time: number;
  bedtime_end: string;
  bedtime_start: string;
  day: string;
  deep_sleep_duration: number;
  efficiency: number;
  heart_rate: OuraTimeSeries | null;
  hrv: OuraTimeSeries | null;
  latency: number;
  light_sleep_duration: number;
  low_battery_alert: boolean;
  lowest_heart_rate: number;
  movement_30_sec: string | null;
  period: number;
  readiness: OuraReadinessContributors | null;
  readiness_score_delta: number | null;
  rem_sleep_duration: number;
  restless_periods: number;
  sleep_phase_5_min: string | null;
  sleep_score_delta: number | null;
  time_in_bed: number;
  total_sleep_duration: number;
  type: 'deleted' | 'sleep' | 'long_sleep' | 'late_nap' | 'rest';
}

export interface OuraDailySleep {
  id: string;
  contributors: {
    deep_sleep: number;
    efficiency: number;
    latency: number;
    rem_sleep: number;
    restfulness: number;
    timing: number;
    total_sleep: number;
  };
  day: string;
  score: number;
  timestamp: string;
}

export interface OuraDailyActivity {
  id: string;
  class_5_min: string | null;
  score: number;
  active_calories: number;
  average_met_minutes: number;
  contributors: {
    meet_daily_targets: number;
    move_every_hour: number;
    recovery_time: number;
    stay_active: number;
    training_frequency: number;
    training_volume: number;
  };
  equivalent_walking_distance: number;
  high_activity_met_minutes: number;
  high_activity_time: number;
  inactivity_alerts: number;
  low_activity_met_minutes: number;
  low_activity_time: number;
  medium_activity_met_minutes: number;
  medium_activity_time: number;
  met: OuraTimeSeries | null;
  meters_to_target: number;
  non_wear_time: number;
  resting_time: number;
  sedentary_met_minutes: number;
  sedentary_time: number;
  steps: number;
  target_calories: number;
  target_meters: number;
  total_calories: number;
  day: string;
  timestamp: string;
}

export interface OuraDailyReadiness {
  id: string;
  contributors: OuraReadinessContributors;
  day: string;
  score: number;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  timestamp: string;
}

export interface OuraReadinessContributors {
  activity_balance: number;
  body_temperature: number;
  hrv_balance: number;
  previous_day_activity: number;
  previous_night: number;
  recovery_index: number;
  resting_heart_rate: number;
  sleep_balance: number;
}

export interface OuraHeartRate {
  bpm: number;
  source: 'awake' | 'rest' | 'sleep' | 'session' | 'live' | 'workout';
  timestamp: string;
}

export interface OuraPersonalInfo {
  id: string;
  age: number;
  weight: number;
  height: number;
  biological_sex: string;
  email: string;
}

export interface OuraTimeSeries {
  interval: number;
  items: number[];
  timestamp: string;
}

export interface OuraWorkout {
  id: string;
  activity: string;
  calories: number;
  day: string;
  distance: number | null;
  end_datetime: string;
  intensity: 'easy' | 'moderate' | 'hard';
  label: string | null;
  source: string;
  start_datetime: string;
}

export interface OuraTag {
  id: string;
  day: string;
  text: string;
  timestamp: string;
  tags: string[];
}

export interface OuraDashboardData {
  personalInfo: OuraPersonalInfo | null;
  sleep: {
    todayScore: number | null;
    lastNight: OuraSleepPeriod | null;
    weeklyAverage: number;
    recentSleep: OuraDailySleep[];
  };
  activity: {
    todayScore: number | null;
    todaySteps: number;
    todayCalories: number;
    recentActivity: OuraDailyActivity[];
  };
  readiness: {
    todayScore: number | null;
    recentReadiness: OuraDailyReadiness[];
  };
  heartRate: {
    restingHR: number | null;
    latestHRV: number | null;
    recentHeartRate: OuraHeartRate[];
  };
  workouts: OuraWorkout[];
}
