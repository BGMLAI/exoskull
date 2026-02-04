// ============================================================================
// Alignment Guardian - Continuous beneficiary verification
// ============================================================================
// Ensures autonomous actions actually benefit the user.
// Pre-action: Scores benefit alignment before execution.
// Post-action: Measures effectiveness 24h and 7d later.
// Drift: Detects when user values have shifted.
// Throttle: Auto-reduces interventions when effectiveness drops.
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  GuardianVerdict,
  EffectivenessResult,
  ValueDriftResult,
  ThrottleConfig,
  UserValue,
  PreActionSnapshot,
  ValueConflict,
} from "./guardian-types";
import type { PlannedIntervention } from "./types";

let _instance: AlignmentGuardian | null = null;

export function getAlignmentGuardian(): AlignmentGuardian {
  if (!_instance) {
    _instance = new AlignmentGuardian();
  }
  return _instance;
}

export class AlignmentGuardian {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  // ==========================================================================
  // PRE-ACTION: Verify benefit before execution
  // ==========================================================================

  async verifyBenefit(
    tenantId: string,
    intervention: PlannedIntervention,
  ): Promise<GuardianVerdict> {
    try {
      // 1. Check daily throttle
      const throttle = await this.getThrottleConfig(tenantId);
      const todayCount = await this.getInterventionCountToday(tenantId);

      if (todayCount >= throttle.maxInterventionsPerDay) {
        return {
          action: "deferred",
          benefitScore: 0,
          reasoning: `Przekroczono limit ${throttle.maxInterventionsPerDay} interwencji dziennie. Odlozono.`,
          valueAlignmentScore: 0,
        };
      }

      // 2. Check if intervention type is disabled
      if (throttle.disabledTypes.includes(intervention.type)) {
        return {
          action: "blocked",
          benefitScore: 0,
          reasoning: `Typ interwencji '${intervention.type}' jest wylaczony przez throttle.`,
          valueAlignmentScore: 0,
        };
      }

      // 3. Load user values
      const userValues = await this.getUserValues(tenantId);

      // 4. Score benefit alignment
      const benefitScore = await this.scoreBenefit(intervention, userValues);

      // 5. Check effectiveness history for this type
      const avgEffectiveness = await this.getAvgEffectiveness(
        tenantId,
        intervention.type,
      );

      // 6. Calculate value alignment
      const valueAlignment = this.calculateValueAlignment(
        intervention,
        userValues,
      );

      // 7. Combined score (60% benefit + 40% historical effectiveness)
      const combinedScore =
        avgEffectiveness !== null
          ? benefitScore * 0.6 + avgEffectiveness * 0.4
          : benefitScore;

      // 8. Decision
      if (combinedScore < throttle.minBenefitScore) {
        return {
          action: "blocked",
          benefitScore: Math.round(combinedScore * 100) / 100,
          reasoning:
            `Wynik korzysci (${combinedScore.toFixed(1)}) ponizej progu (${throttle.minBenefitScore}). ` +
            `Benefit: ${benefitScore.toFixed(1)}, Historia: ${avgEffectiveness?.toFixed(1) || "brak"}. ` +
            `Typ: ${intervention.type}, Tytul: ${intervention.title}`,
          valueAlignmentScore: valueAlignment,
        };
      }

      // 9. Check system interest protection
      const systemInterestSafe = this.checkSystemInterest(intervention);
      if (!systemInterestSafe) {
        return {
          action: "blocked",
          benefitScore: combinedScore,
          reasoning:
            "Interwencja moze sluzyc interesom systemu zamiast uzytkownika.",
          valueAlignmentScore: valueAlignment,
        };
      }

      // 10. Record pre-action snapshot for later effectiveness measurement
      await this.recordPreActionSnapshot(tenantId, intervention);

      return {
        action: "approved",
        benefitScore: Math.round(combinedScore * 100) / 100,
        reasoning:
          `Zatwierdzone. Benefit: ${benefitScore.toFixed(1)}, ` +
          `Alignment: ${valueAlignment.toFixed(1)}, ` +
          `Historia: ${avgEffectiveness?.toFixed(1) || "brak danych"}`,
        valueAlignmentScore: valueAlignment,
      };
    } catch (error) {
      console.error("[Guardian] verifyBenefit error:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
        interventionType: intervention.type,
      });
      // Fail-open: allow action if guardian fails (better than blocking everything)
      return {
        action: "approved",
        benefitScore: 5.0,
        reasoning: "Guardian error - domyslne zatwierdzenie (fail-open).",
        valueAlignmentScore: 5.0,
      };
    }
  }

  // ==========================================================================
  // POST-ACTION: Measure effectiveness
  // ==========================================================================

  async measureEffectiveness(
    interventionId: string,
  ): Promise<EffectivenessResult | null> {
    try {
      // Get effectiveness record
      const { data: record } = await this.supabase
        .from("exo_intervention_effectiveness")
        .select(
          "*, exo_interventions!inner(tenant_id, intervention_type, user_feedback)",
        )
        .eq("intervention_id", interventionId)
        .single();

      if (!record) return null;

      const tenantId = record.exo_interventions.tenant_id;

      // Collect current metrics
      const currentMetrics = await this.collectMetricsSnapshot(tenantId);

      // Determine which measurement phase (24h or 7d)
      const isFirst = !record.measured_at_24h;
      const updateField = isFirst
        ? "post_action_metrics_24h"
        : "post_action_metrics_7d";
      const timestampField = isFirst ? "measured_at_24h" : "measured_at_7d";

      // Calculate effectiveness score
      const preMetrics = record.pre_action_metrics || {};
      const score = this.calculateEffectivenessScore(
        preMetrics,
        currentMetrics,
        record.exo_interventions,
      );

      // Update record
      await this.supabase
        .from("exo_intervention_effectiveness")
        .update({
          [updateField]: currentMetrics,
          [timestampField]: new Date().toISOString(),
          effectiveness_score: score,
        })
        .eq("id", record.id);

      console.log("[Guardian] Effectiveness measured:", {
        interventionId,
        phase: isFirst ? "24h" : "7d",
        score,
      });

      return {
        interventionId,
        score,
        metrics: { before: preMetrics, after: currentMetrics },
      };
    } catch (error) {
      console.error("[Guardian] measureEffectiveness error:", {
        error: error instanceof Error ? error.message : String(error),
        interventionId,
      });
      return null;
    }
  }

  // ==========================================================================
  // VALUE DRIFT: Detect changes in user priorities
  // ==========================================================================

  async detectValueDrift(tenantId: string): Promise<ValueDriftResult> {
    try {
      const userValues = await this.getUserValues(tenantId);

      if (userValues.length === 0) {
        return {
          driftDetected: false,
          areas: [],
          suggestReconfirmation: false,
        };
      }

      const areas: ValueDriftResult["areas"] = [];

      for (const value of userValues) {
        // Check how long since last confirmation
        const daysSinceConfirmation = Math.floor(
          (Date.now() - new Date(value.last_confirmed_at).getTime()) /
            (1000 * 60 * 60 * 24),
        );

        // Check recent intervention effectiveness for this area
        const { data: recentEffectiveness } = await this.supabase
          .from("exo_intervention_effectiveness")
          .select("effectiveness_score")
          .eq("tenant_id", tenantId)
          .ilike("intervention_type", `%${value.value_area}%`)
          .order("created_at", { ascending: false })
          .limit(5);

        const scores = (recentEffectiveness || [])
          .map((e) => e.effectiveness_score)
          .filter((s): s is number => s !== null);

        // Detect declining effectiveness as drift signal
        if (scores.length >= 3) {
          const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
          const secondHalf = scores.slice(Math.floor(scores.length / 2));
          const avgFirst =
            firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const avgSecond =
            secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          const deviation = avgSecond - avgFirst;

          if (Math.abs(deviation) > 1.5) {
            areas.push({
              area: value.value_area,
              deviation: Math.round(deviation * 100) / 100,
              direction: deviation > 0 ? "increasing" : "decreasing",
            });
          }
        }

        // Flag if not confirmed in 30+ days
        if (daysSinceConfirmation > 30 && !value.drift_detected) {
          await this.supabase
            .from("exo_user_values")
            .update({
              drift_detected: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", value.id);
        }
      }

      const driftDetected = areas.length > 0;
      const suggestReconfirmation =
        driftDetected || userValues.some((v) => v.drift_detected);

      if (driftDetected) {
        console.log("[Guardian] Value drift detected:", { tenantId, areas });
      }

      return { driftDetected, areas, suggestReconfirmation };
    } catch (error) {
      console.error("[Guardian] detectValueDrift error:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
      });
      return { driftDetected: false, areas: [], suggestReconfirmation: false };
    }
  }

  // ==========================================================================
  // THROTTLE: Auto-adjust intervention frequency
  // ==========================================================================

  async calculateThrottle(tenantId: string): Promise<ThrottleConfig> {
    const config = await this.getThrottleConfig(tenantId);

    // Get recent effectiveness scores
    const { data: recentScores } = await this.supabase
      .from("exo_intervention_effectiveness")
      .select("effectiveness_score, intervention_type")
      .eq("tenant_id", tenantId)
      .not("effectiveness_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!recentScores || recentScores.length < 5) return config;

    const avgScore =
      recentScores.reduce((sum, s) => sum + (s.effectiveness_score || 0), 0) /
      recentScores.length;

    // If average effectiveness drops below 4, reduce intervention frequency
    if (avgScore < 4 && config.auto_throttle_enabled !== false) {
      const newMax = Math.max(3, config.maxInterventionsPerDay - 2);
      const newCooldown = Math.min(120, config.cooldownMinutes + 15);

      // Find types with consistently low scores
      const typeCounts = new Map<string, { total: number; lowCount: number }>();
      for (const s of recentScores) {
        const existing = typeCounts.get(s.intervention_type) || {
          total: 0,
          lowCount: 0,
        };
        existing.total++;
        if ((s.effectiveness_score || 0) < 3) existing.lowCount++;
        typeCounts.set(s.intervention_type, existing);
      }

      const disabledTypes = Array.from(typeCounts.entries())
        .filter(
          ([_, counts]) =>
            counts.total >= 3 && counts.lowCount / counts.total > 0.7,
        )
        .map(([type]) => type);

      // Update config
      await this.supabase.from("exo_guardian_config").upsert(
        {
          tenant_id: tenantId,
          max_interventions_per_day: newMax,
          cooldown_minutes: newCooldown,
          disabled_types: [
            ...new Set([...config.disabledTypes, ...disabledTypes]),
          ],
          last_throttle_adjustment: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

      console.log("[Guardian] Throttle adjusted:", {
        tenantId,
        avgScore,
        newMax,
        newCooldown,
        newlyDisabled: disabledTypes,
      });

      return {
        maxInterventionsPerDay: newMax,
        cooldownMinutes: newCooldown,
        minBenefitScore: config.minBenefitScore,
        disabledTypes: [
          ...new Set([...config.disabledTypes, ...disabledTypes]),
        ],
      };
    }

    return config;
  }

  // ==========================================================================
  // VALUE CONFLICTS: Detect contradicting goals
  // ==========================================================================

  async detectValueConflicts(tenantId: string): Promise<ValueConflict[]> {
    const values = await this.getUserValues(tenantId);
    if (values.length < 2) return [];

    const conflicts: ValueConflict[] = [];

    // Known conflict patterns
    const CONFLICT_PATTERNS: Array<[string, string, string]> = [
      [
        "sleep",
        "productivity",
        "Wiecej snu vs wiecej pracy - trzeba znalezc balans",
      ],
      ["social", "focus", "Czas na relacje vs czas na gleboka prace"],
      ["health", "finance", "Inwestycje w zdrowie vs oszczedzanie"],
      [
        "creativity",
        "productivity",
        "Kreatywna eksploracja vs realizacja zadan",
      ],
    ];

    for (const [a, b, desc] of CONFLICT_PATTERNS) {
      const valueA = values.find((v) => v.value_area.toLowerCase().includes(a));
      const valueB = values.find((v) => v.value_area.toLowerCase().includes(b));

      if (
        valueA &&
        valueB &&
        valueA.importance > 0.6 &&
        valueB.importance > 0.6
      ) {
        // Check if already recorded
        const { data: existing } = await this.supabase
          .from("exo_value_conflicts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("value_a", valueA.value_area)
          .eq("value_b", valueB.value_area)
          .eq("resolved", false)
          .limit(1);

        if (!existing || existing.length === 0) {
          const { data: conflict } = await this.supabase
            .from("exo_value_conflicts")
            .insert({
              tenant_id: tenantId,
              value_a: valueA.value_area,
              value_b: valueB.value_area,
              conflict_description: desc,
              suggested_resolution:
                `Obie wartosci (${valueA.value_area}, ${valueB.value_area}) sa wazne. ` +
                `Proponuje ustalenie priorytetow tygodniowych - np. pon-czw: ${valueB.value_area}, pt-nd: ${valueA.value_area}.`,
            })
            .select()
            .single();

          if (conflict) conflicts.push(conflict as ValueConflict);
        }
      }
    }

    return conflicts;
  }

  // ==========================================================================
  // SYSTEM INTEREST PROTECTION
  // ==========================================================================

  checkSystemInterest(intervention: PlannedIntervention): boolean {
    // Red flags that suggest system is optimizing for itself:
    const redFlags = [
      // Too many notifications = engagement farming
      intervention.type === "proactive_message" &&
        intervention.priority === "low",
      // Upsell disguised as help
      intervention.title?.toLowerCase().includes("upgrade") ||
        intervention.title?.toLowerCase().includes("premium"),
      // Frequent re-engagement that user hasn't requested
      intervention.type === "pattern_notification" &&
        intervention.actionPayload?.action === "send_notification" &&
        !intervention.requiresApproval,
    ];

    return !redFlags.some((flag) => flag);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async getUserValues(tenantId: string): Promise<UserValue[]> {
    const { data } = await this.supabase
      .from("exo_user_values")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("importance", { ascending: false });

    return (data || []) as UserValue[];
  }

  private async getThrottleConfig(
    tenantId: string,
  ): Promise<ThrottleConfig & { auto_throttle_enabled?: boolean }> {
    const { data } = await this.supabase
      .from("exo_guardian_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!data) {
      return {
        maxInterventionsPerDay: 10,
        cooldownMinutes: 30,
        minBenefitScore: 4.0,
        disabledTypes: [],
        auto_throttle_enabled: true,
      };
    }

    return {
      maxInterventionsPerDay: data.max_interventions_per_day || 10,
      cooldownMinutes: data.cooldown_minutes || 30,
      minBenefitScore: data.min_benefit_score || 4.0,
      disabledTypes: data.disabled_types || [],
      auto_throttle_enabled: data.auto_throttle_enabled,
    };
  }

  private async getInterventionCountToday(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("exo_interventions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date().toISOString().split("T")[0] + "T00:00:00Z")
      .not("status", "in", '("cancelled","expired","rejected")');

    return count || 0;
  }

  private async getAvgEffectiveness(
    tenantId: string,
    interventionType: string,
  ): Promise<number | null> {
    const { data } = await this.supabase
      .from("exo_intervention_effectiveness")
      .select("effectiveness_score")
      .eq("tenant_id", tenantId)
      .eq("intervention_type", interventionType)
      .not("effectiveness_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return null;

    return (
      data.reduce((sum, d) => sum + (d.effectiveness_score || 0), 0) /
      data.length
    );
  }

  private async scoreBenefit(
    intervention: PlannedIntervention,
    userValues: UserValue[],
  ): Promise<number> {
    // Rule-based scoring (no AI call needed for most cases)
    let score = 5.0; // Neutral baseline

    // High-value intervention types
    const highValueTypes = ["health_alert", "gap_detection", "goal_nudge"];
    const mediumValueTypes = [
      "task_reminder",
      "schedule_adjustment",
      "pattern_notification",
    ];
    const lowValueTypes = ["proactive_message", "automation_trigger"];

    if (highValueTypes.includes(intervention.type)) score += 2.0;
    else if (mediumValueTypes.includes(intervention.type)) score += 1.0;
    else if (lowValueTypes.includes(intervention.type)) score -= 0.5;

    // Priority boost
    if (intervention.priority === "critical") score += 2.0;
    else if (intervention.priority === "high") score += 1.0;
    else if (intervention.priority === "low") score -= 1.0;

    // Value alignment boost
    for (const value of userValues) {
      if (
        intervention.title
          ?.toLowerCase()
          .includes(value.value_area.toLowerCase()) ||
        intervention.description
          ?.toLowerCase()
          .includes(value.value_area.toLowerCase())
      ) {
        score += value.importance * 2;
        break;
      }
    }

    // Clamp to 0-10
    return Math.max(0, Math.min(10, score));
  }

  private calculateValueAlignment(
    intervention: PlannedIntervention,
    userValues: UserValue[],
  ): number {
    if (userValues.length === 0) return 5.0;

    let maxAlignment = 0;
    const interventionText =
      `${intervention.title} ${intervention.description || ""}`.toLowerCase();

    for (const value of userValues) {
      if (interventionText.includes(value.value_area.toLowerCase())) {
        maxAlignment = Math.max(maxAlignment, value.importance * 10);
      }
    }

    return maxAlignment || 5.0; // Default to neutral if no match
  }

  private async recordPreActionSnapshot(
    tenantId: string,
    intervention: PlannedIntervention,
  ): Promise<void> {
    const snapshot = await this.collectMetricsSnapshot(tenantId);

    await this.supabase.from("exo_intervention_effectiveness").insert({
      intervention_id: intervention.id || crypto.randomUUID(),
      tenant_id: tenantId,
      intervention_type: intervention.type,
      pre_action_metrics: snapshot,
    });
  }

  private async collectMetricsSnapshot(
    tenantId: string,
  ): Promise<Record<string, number>> {
    const now = new Date();
    const yesterday = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    // Parallel data collection
    const [conversations, tasks, interventions] = await Promise.all([
      this.supabase
        .from("exo_conversations")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", yesterday),
      this.supabase
        .from("exo_tasks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "done")
        .gte("completed_at", yesterday),
      this.supabase
        .from("exo_interventions")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", now.toISOString().split("T")[0] + "T00:00:00Z"),
    ]);

    return {
      conversations_24h: conversations.count || 0,
      tasks_completed_24h: tasks.count || 0,
      interventions_today: interventions.count || 0,
      timestamp: now.getTime(),
    };
  }

  private calculateEffectivenessScore(
    before: Record<string, number>,
    after: Record<string, number>,
    intervention: { user_feedback?: string },
  ): number {
    let score = 5.0;

    // User feedback is strongest signal
    if (intervention.user_feedback === "helpful") score += 3;
    else if (intervention.user_feedback === "neutral") score += 0;
    else if (intervention.user_feedback === "unhelpful") score -= 2;
    else if (intervention.user_feedback === "harmful") score -= 4;

    // Metric changes (engagement increase = positive)
    const convBefore = before.conversations_24h || 0;
    const convAfter = after.conversations_24h || 0;
    if (convAfter > convBefore) score += 0.5;

    const tasksBefore = before.tasks_completed_24h || 0;
    const tasksAfter = after.tasks_completed_24h || 0;
    if (tasksAfter > tasksBefore) score += 0.5;

    return Math.max(0, Math.min(10, score));
  }
}
