// ============================================================================
// Autonomy Control Center — Shared Types & Constants
// ============================================================================

export interface AutonomyGrantUI {
  id: string;
  user_id: string;
  action_pattern: string;
  category: string;
  granted_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
  error_count: number;
  spending_limit: number | null;
  daily_limit: number | null;
  is_active: boolean;
}

export interface InterventionUI {
  id: string;
  tenant_id: string;
  intervention_type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  urgency_score: number;
  requires_approval: boolean;
  executed_at: string | null;
  execution_error?: string | null;
  source_agent?: string | null;
  trigger_reason?: string | null;
  user_feedback: string | null;
  feedback_notes: string | null;
  created_at: string;
  benefit_score?: number | null;
  guardian_verdict?: string | null;
}

export interface AutonomyStatsUI {
  total_interventions: number;
  completed: number;
  failed: number;
  avg_effectiveness: number;
  active_grants: number;
}

export interface GuardianDataUI {
  values: UserValueUI[];
  config: ThrottleConfigUI;
  stats: {
    today_approved: number;
    today_blocked: number;
    avg_effectiveness: number | null;
    total_measured: number;
  };
  conflicts: ValueConflictUI[];
}

export interface UserValueUI {
  id: string;
  tenant_id: string;
  value_area: string;
  importance: number;
  description: string | null;
  source: string;
  last_confirmed_at: string;
  drift_detected: boolean;
}

export interface ValueConflictUI {
  id: string;
  tenant_id: string;
  value_a: string;
  value_b: string;
  conflict_description: string;
  suggested_resolution: string | null;
  resolved: boolean;
}

export interface ThrottleConfigUI {
  max_interventions_per_day: number;
  cooldown_minutes: number;
  min_benefit_score: number;
  disabled_types: string[];
}

export interface MAPEKCycleUI {
  id: string;
  tenant_id: string;
  trigger_type: string;
  trigger_event: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  interventions_proposed: number;
  interventions_executed: number;
  error: string | null;
}

// ============================================================================
// Constants
// ============================================================================

export const CATEGORY_LABELS: Record<string, string> = {
  communication: "Komunikacja",
  tasks: "Zadania",
  health: "Zdrowie",
  finance: "Finanse",
  calendar: "Kalendarz",
  smart_home: "Smart Home",
  other: "Inne",
};

export const CATEGORY_ICONS: Record<string, string> = {
  communication: "💬",
  tasks: "✅",
  health: "❤️",
  finance: "💰",
  calendar: "📅",
  smart_home: "🏠",
  other: "⚙️",
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  proposed: {
    label: "Zaproponowane",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  approved: {
    label: "Zatwierdzone",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  executing: {
    label: "Wykonywane",
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  completed: {
    label: "Wykonane",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Nieudane",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  rejected: {
    label: "Odrzucone",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  expired: {
    label: "Wygasle",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  },
  cancelled: {
    label: "Anulowane",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  },
};

export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> =
  {
    low: { label: "Niski", color: "text-green-600" },
    medium: { label: "Sredni", color: "text-yellow-600" },
    high: { label: "Wysoki", color: "text-orange-600" },
    critical: { label: "Krytyczny", color: "text-red-600" },
  };

export const INTERVENTION_TYPES: Record<string, string> = {
  proactive_message: "Wiadomosc",
  task_creation: "Nowe zadanie",
  task_reminder: "Przypomnienie",
  schedule_adjustment: "Zmiana planu",
  health_alert: "Alert zdrowia",
  goal_nudge: "Motywacja",
  pattern_notification: "Wzorzec",
  gap_detection: "Wykryta luka",
  automation_trigger: "Automatyzacja",
  custom: "Inne",
};
