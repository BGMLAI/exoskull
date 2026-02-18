/**
 * Autonomy System Types
 *
 * ExoSkull MAPE-K Loop
 * Monitor -> Analyze -> Plan -> Execute -> Knowledge
 */

// ============================================================================
// PERMISSION MODEL
// ============================================================================

export type PermissionCategory =
  | "communication"
  | "tasks"
  | "health"
  | "finance"
  | "calendar"
  | "smart_home"
  | "other";

export interface AutonomyGrant {
  id: string;
  userId: string;
  actionPattern: string; // e.g., "send_sms:*", "create_task", "*"
  category: PermissionCategory;
  grantedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  errorCount: number;
  spendingLimit: number | null;
  dailyLimit: number | null;
  isActive: boolean;
}

export interface PermissionCheckResult {
  granted: boolean;
  reason:
    | "granted"
    | "no_matching_grant"
    | "disabled"
    | "expired"
    | "daily_limit_reached"
    | "spending_limit_reached";
  grant?: AutonomyGrant;
  remainingDaily?: number;
}

// ============================================================================
// INTERVENTION
// ============================================================================

export type InterventionType =
  | "proactive_message"
  | "task_creation"
  | "task_reminder"
  | "schedule_adjustment"
  | "health_alert"
  | "goal_nudge"
  | "pattern_notification"
  | "gap_detection"
  | "automation_trigger"
  | "health_prediction"
  | "custom";

export type InterventionStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rejected"
  | "expired"
  | "cancelled";

export type InterventionPriority = "low" | "medium" | "high" | "critical";

export type UserFeedback = "helpful" | "neutral" | "unhelpful" | "harmful";

export interface ActionPayload {
  action: string;
  params: Record<string, unknown>;
}

export interface Intervention {
  id: string;
  tenantId: string;
  interventionType: InterventionType;
  title: string;
  description: string | null;
  actionPayload: ActionPayload;
  sourceAgent: string | null;
  sourcePatternId: string | null;
  triggerReason: string | null;
  priority: InterventionPriority;
  urgencyScore: number;
  scheduledFor: string | null;
  expiresAt: string | null;
  status: InterventionStatus;
  requiresApproval: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  executionError: string | null;
  retryCount: number;
  maxRetries: number;
  userFeedback: UserFeedback | null;
  feedbackNotes: string | null;
  createdAt: string;
}

export interface ProposeInterventionParams {
  tenantId: string;
  type: InterventionType;
  title: string;
  description?: string;
  actionPayload: ActionPayload;
  priority?: InterventionPriority;
  sourceAgent?: string;
  sourcePatternId?: string;
  triggerReason?: string;
  requiresApproval?: boolean;
  scheduledFor?: string;
  expiresAt?: string;
}

// ============================================================================
// MAPE-K LOOP
// ============================================================================

export interface MonitorData {
  // Recent activity
  conversationsLast24h: number;
  tasksCreated: number;
  tasksDue: number;
  tasksOverdue: number;

  // Health data (if available)
  sleepHoursLast7d: number[];
  activityMinutesLast7d: number[];
  hrvTrend: "improving" | "stable" | "declining" | "unknown";

  // Patterns
  recentPatterns: string[];
  activeAlerts: number;

  // User state
  lastInteractionAt: string | null;
  currentMood: string | null;
  energyLevel: number | null;

  // Calendar (real Google Calendar events when available)
  upcomingEvents24h: number;
  freeTimeBlocks: number;
  calendarEvents?: Array<{ time: string; title: string; duration?: number }>;
  nextMeetingInMinutes?: number | null;

  // Google health metrics (from exo_health_metrics, synced by rig-sync CRON)
  yesterdaySteps?: number | null;
  yesterdaySleepMinutes?: number | null;
  yesterdayCalories?: number | null;
  lastHeartRate?: number | null;

  // Integrations
  connectedRigs: string[];
  lastSyncTimes: Record<string, string>;

  // System health (L10)
  systemMetrics?: SystemMetrics;
}

export interface AnalyzeResult {
  // Detected issues
  issues: Array<{
    type:
      | "sleep_debt"
      | "task_overload"
      | "missed_goal"
      | "health_concern"
      | "social_isolation"
      | "productivity_drop"
      | "custom";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    data?: Record<string, unknown>;
  }>;

  // Opportunities
  opportunities: Array<{
    type: "automation" | "habit" | "optimization" | "learning";
    description: string;
    potentialImpact: number; // 1-10
    confidence: number; // 0-1
  }>;

  // Recommendations
  recommendations: string[];

  // Gaps detected
  gaps: Array<{
    area: string;
    description: string;
    lastMentioned: string | null;
    suggestedAction: string;
  }>;
}

export interface PlannedIntervention {
  id?: string;
  type: InterventionType;
  title: string;
  description: string;
  actionPayload: ActionPayload;
  priority: InterventionPriority;
  requiresApproval: boolean;
  reasoning: string;
}

export interface PlanResult {
  interventions: PlannedIntervention[];

  // What will NOT be done (and why)
  skipped: Array<{
    action: string;
    reason: string;
  }>;
}

export interface ExecuteResult {
  interventionsCreated: number;
  interventionsExecuted: number;
  interventionsFailed: number;
  errors: string[];
  results: Array<{
    interventionId: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
}

export interface KnowledgeResult {
  patternsDetected: number;
  patternsUpdated: number;
  highlightsAdded: number;
  feedbackProcessed: number;
  learnings: string[];
}

export interface MAPEKCycleResult {
  cycleId: string;
  tenantId: string;
  trigger: "cron" | "event" | "manual";
  triggerEvent?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  monitor: MonitorData;
  analyze: AnalyzeResult;
  plan: PlanResult;
  execute: ExecuteResult;
  knowledge: KnowledgeResult;
  success: boolean;
  error?: string;
}

// ============================================================================
// ACTION EXECUTOR
// ============================================================================

export type ActionType =
  | "send_sms"
  | "send_email"
  | "create_task"
  | "complete_task"
  | "create_event"
  | "send_notification"
  | "log_health"
  | "trigger_checkin"
  | "run_automation"
  | "custom";

export interface ActionDefinition {
  type: ActionType;
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  category: PermissionCategory;
  riskLevel: "low" | "medium" | "high";
}

export interface ActionRequest {
  type: ActionType;
  tenantId: string;
  params: Record<string, unknown>;
  interventionId?: string;
  skipPermissionCheck?: boolean; // Only for internal system actions
}

export interface ActionResult {
  success: boolean;
  actionType: ActionType;
  data?: unknown;
  error?: string;
  durationMs: number;
}

// ============================================================================
// GAP DETECTOR
// ============================================================================

export interface LifeArea {
  slug: string;
  name: string;
  description: string;
  trackingFrequency: "daily" | "weekly" | "monthly" | "on_demand";
  dataPoints: string[]; // What data points indicate activity
}

export const LIFE_AREAS: LifeArea[] = [
  {
    slug: "health",
    name: "Health & Fitness",
    description: "Physical health, exercise, sleep, nutrition",
    trackingFrequency: "daily",
    dataPoints: [
      "sleep_entries",
      "activity_entries",
      "health_checkins",
      "meal_logs",
    ],
  },
  {
    slug: "productivity",
    name: "Productivity & Work",
    description: "Tasks, projects, focus time, accomplishments",
    trackingFrequency: "daily",
    dataPoints: ["tasks_completed", "focus_sessions", "projects_progress"],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Income, expenses, savings, investments",
    trackingFrequency: "weekly",
    dataPoints: ["transactions", "budget_checkins", "financial_goals"],
  },
  {
    slug: "social",
    name: "Social & Relationships",
    description: "Family, friends, networking, social events",
    trackingFrequency: "weekly",
    dataPoints: ["social_events", "relationship_checkins", "contacts_reached"],
  },
  {
    slug: "mental",
    name: "Mental Health",
    description: "Mood, stress, meditation, therapy",
    trackingFrequency: "daily",
    dataPoints: ["mood_entries", "meditation_sessions", "journal_entries"],
  },
  {
    slug: "learning",
    name: "Learning & Growth",
    description: "Courses, books, skills, personal development",
    trackingFrequency: "weekly",
    dataPoints: ["learning_sessions", "books_progress", "skills_practiced"],
  },
  {
    slug: "creativity",
    name: "Creativity & Hobbies",
    description: "Creative projects, hobbies, entertainment",
    trackingFrequency: "weekly",
    dataPoints: ["creative_sessions", "hobby_time", "projects"],
  },
];

export interface GapAnalysis {
  area: LifeArea;
  lastActivity: string | null;
  daysSinceActivity: number | null;
  activityCount30d: number;
  expectedCount30d: number;
  coveragePercent: number;
  severity: "none" | "mild" | "moderate" | "severe";
  suggestedIntervention: string | null;
}

// ============================================================================
// SYSTEM METRICS (L10 Self-Optimization)
// ============================================================================

export interface SystemMetrics {
  mapekCycles: {
    total: number;
    successRate: number;
    avgDurationMs: number;
  };
  skillHealth: {
    totalExecutions: number;
    errorRate: number;
    avgExecutionMs: number;
  };
  interventionEffectiveness: {
    approvalRate: number;
    executionRate: number;
    helpfulRate: number;
  };
  aiUsage: {
    requestsToday: number;
    tokensToday: number;
    voiceMinutesToday: number;
  };
  learningEvents: {
    patternsDetected7d: number;
    insightsGenerated7d: number;
  };
}

// ============================================================================
// SELF OPTIMIZER
// ============================================================================

export interface OptimizationTarget {
  type: "agent" | "intervention" | "automation" | "schedule";
  targetId: string;
  metric: "success_rate" | "user_satisfaction" | "response_time" | "engagement";
  currentValue: number;
  targetValue: number;
}

export interface OptimizationResult {
  target: OptimizationTarget;
  action: "adjust" | "disable" | "enhance" | "no_change";
  reasoning: string;
  changes?: Record<string, unknown>;
}

export interface LearningInsight {
  type: "pattern" | "preference" | "optimization" | "warning";
  description: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  data?: Record<string, unknown>;
}
