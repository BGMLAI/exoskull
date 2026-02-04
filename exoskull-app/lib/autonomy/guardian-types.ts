// ============================================================================
// Alignment Guardian Types
// ============================================================================

export interface GuardianVerdict {
  action: "approved" | "blocked" | "modified" | "deferred";
  benefitScore: number;
  reasoning: string;
  valueAlignmentScore: number;
  suggestedModification?: Record<string, unknown>;
}

export interface EffectivenessResult {
  interventionId: string;
  score: number;
  metrics: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
}

export interface ValueDriftResult {
  driftDetected: boolean;
  areas: Array<{
    area: string;
    deviation: number;
    direction: "increasing" | "decreasing";
  }>;
  suggestReconfirmation: boolean;
}

export interface ThrottleConfig {
  maxInterventionsPerDay: number;
  cooldownMinutes: number;
  minBenefitScore: number;
  disabledTypes: string[];
}

export interface UserValue {
  id: string;
  tenant_id: string;
  value_area: string;
  importance: number;
  description: string | null;
  source: "discovery" | "explicit" | "inferred" | "reconfirmed";
  last_confirmed_at: string;
  drift_detected: boolean;
}

export interface InterventionEffectiveness {
  id: string;
  intervention_id: string;
  tenant_id: string;
  intervention_type: string;
  pre_action_metrics: Record<string, number>;
  post_action_metrics_24h: Record<string, number> | null;
  post_action_metrics_7d: Record<string, number> | null;
  effectiveness_score: number | null;
  measured_at_24h: string | null;
  measured_at_7d: string | null;
}

export interface ValueConflict {
  id: string;
  tenant_id: string;
  value_a: string;
  value_b: string;
  conflict_description: string;
  suggested_resolution: string | null;
  resolved: boolean;
}

// Pre-action snapshot types
export interface PreActionSnapshot {
  conversationsLast24h: number;
  tasksCompleted: number;
  interventionsToday: number;
  lastInteractionAt: string | null;
  moodScore: number | null;
  energyLevel: number | null;
}
