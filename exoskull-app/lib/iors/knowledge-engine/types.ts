/**
 * Knowledge Analysis Engine — Types
 *
 * Types for the KAE system that autonomously mines user data,
 * discovers patterns, and proposes actions.
 */

// ============================================================================
// TENANT KNOWLEDGE SNAPSHOT
// ============================================================================

export type TrendDirection = "improving" | "declining" | "stable" | "unknown";

export interface TenantKnowledgeSnapshot {
  tenantId: string;
  collectedAt: Date;

  /** Conversation stats (30d window, from Gold layer) */
  conversations: {
    totalMessages: number;
    avgPerDay: number;
    userMessagesPct: number;
    topTopics: string[];
    emotionTrend: TrendDirection;
    avgValence: number;
    channelBreakdown: Record<string, number>;
  };

  /** Health metrics (30d window, from Gold layer) */
  health: {
    sleepTrend: TrendDirection;
    avgSleepQuality: number | null;
    avgSleepMinutes: number | null;
    avgHRV: number | null;
    avgHeartRate: number | null;
    activityTrend: TrendDirection;
    avgSteps: number | null;
    avgActiveMinutes: number | null;
    activePredictions: Array<{
      metric: string;
      probability: number;
      severity: string;
    }>;
  };

  /** Task & goal stats */
  productivity: {
    completionRate: number;
    overdueCount: number;
    stalledCount: number;
    totalPending: number;
    goalStatuses: Array<{
      name: string;
      trajectory: string;
      progress: number;
      daysRemaining: number | null;
    }>;
  };

  /** Learning system state */
  knowledge: {
    topHighlights: Array<{
      category: string;
      content: string;
      importance: number;
    }>;
    activePatterns: Array<{
      type: string;
      description: string;
      confidence: number;
    }>;
    mits: Array<{ rank: number; objective: string; score: number }>;
  };

  /** IORS effectiveness metrics */
  systemPerformance: {
    interventionSuccessRate: number;
    avgFeedbackRating: number | null;
    coachingAckRate: number;
    personalityStyle: string;
    proactivityLevel: number;
  };

  /** Domains with no data (gap detection) */
  missingDomains: string[];

  /** Delta vs prior 30d (computed from Gold daily data) */
  priorPeriodDelta: {
    sleepQualityChange: number;
    productivityChange: number;
    engagementChange: number;
    moodChange: number;
  };

  /** Data Lake freshness metadata */
  dataSource: "gold" | "raw" | "mixed";
}

// ============================================================================
// KNOWLEDGE INSIGHT (AI output)
// ============================================================================

export type InsightType =
  | "pattern"
  | "gap"
  | "drift"
  | "correlation"
  | "opportunity"
  | "warning"
  | "celebration";

export type ActionType =
  | "propose_intervention"
  | "adjust_behavior"
  | "suggest_tracking"
  | "probe_gap"
  | "celebrate"
  | "warn_drift"
  | "connect_dots";

export interface KnowledgeInsight {
  type: InsightType;
  title: string;
  description: string;
  confidence: number;
  domains: string[];
  evidence: string[];

  action: {
    type: ActionType;
    payload: Record<string, unknown>;
    priority: "low" | "medium" | "high";
    requires_user_approval: boolean;
  };

  expiry_hours: number;
}

// ============================================================================
// ACTION ROUTING RESULT
// ============================================================================

export type ActionStatus =
  | "executed"
  | "proposed"
  | "blocked"
  | "skipped"
  | "error";

export interface ActionResult {
  insightTitle: string;
  actionType: ActionType;
  status: ActionStatus;
  reason?: string;
  interventionId?: string;
}

// ============================================================================
// ANALYSIS RUN RESULT
// ============================================================================

export type AnalysisType = "light" | "deep";
export type AnalysisTrigger = "loop_daily" | "loop_15" | "manual" | "event";

export interface KnowledgeAnalysisResult {
  tenantId: string;
  analysisType: AnalysisType;
  trigger: AnalysisTrigger;
  insights: KnowledgeInsight[];
  actions: ActionResult[];
  modelUsed: string | null;
  modelTier: number;
  costCents: number;
  durationMs: number;
}
