/**
 * Prediction Engine — Orchestrator
 *
 * Runs all health models, stores predictions, and creates
 * autonomy interventions for high-confidence predictions.
 */

import type { InterventionPriority } from "../autonomy/types";
import {
  type Prediction,
  loadHealthData,
  predictIllnessRisk,
  predictProductivityImpact,
  predictBurnoutRisk,
  predictFitnessTrajectory,
} from "./health-models";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// ============================================================================
// THRESHOLDS FOR INTERVENTION CREATION
// ============================================================================

const CONFIDENCE_THRESHOLD = 0.75;
const PROBABILITY_THRESHOLD = 0.5;

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export async function runPredictions(tenantId: string): Promise<Prediction[]> {
  const data = await loadHealthData(tenantId, 14);

  if (data.length === 0) {
    logger.info("[Predictions] No health data for tenant:", tenantId);
    return [];
  }

  const predictions: Prediction[] = [];

  const illness = predictIllnessRisk(tenantId, data);
  if (illness) predictions.push(illness);

  const productivity = predictProductivityImpact(tenantId, data);
  if (productivity) predictions.push(productivity);

  const burnout = predictBurnoutRisk(tenantId, data);
  if (burnout) predictions.push(burnout);

  const fitness = predictFitnessTrajectory(tenantId, data);
  if (fitness) predictions.push(fitness);

  return predictions;
}

// ============================================================================
// STORAGE
// ============================================================================

export async function storePredictions(
  predictions: Prediction[],
): Promise<void> {
  if (predictions.length === 0) return;

  const supabase = getServiceSupabase();

  const rows = predictions.map((p) => ({
    tenant_id: p.tenantId,
    metric: p.metric,
    probability: p.probability,
    confidence: p.confidence,
    severity: p.severity,
    message_pl: p.message_pl,
    message_en: p.message_en,
    data_points: p.data_points,
    expires_at: p.expires_at.toISOString(),
    metadata: p.metadata,
  }));

  const { error } = await supabase.from("exo_predictions").insert(rows);

  if (error) {
    console.error("[Predictions] Failed to store predictions:", {
      tenantId: predictions[0].tenantId,
      error: error.message,
      count: predictions.length,
    });
  }
}

// ============================================================================
// INTERVENTION CREATION
// ============================================================================

function severityToPriority(
  severity: Prediction["severity"],
): InterventionPriority {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

export async function createInterventionsFromPredictions(
  predictions: Prediction[],
): Promise<number> {
  const supabase = getServiceSupabase();
  let created = 0;

  const actionable = predictions.filter(
    (p) =>
      p.confidence >= CONFIDENCE_THRESHOLD &&
      p.probability >= PROBABILITY_THRESHOLD,
  );

  for (const p of actionable) {
    try {
      const requiresApproval = p.severity === "low" || p.severity === "medium";

      const { data: interventionId, error } = await supabase.rpc(
        "propose_intervention",
        {
          p_tenant_id: p.tenantId,
          p_type: "health_prediction",
          p_title: `Health Prediction: ${p.metric.replace(/_/g, " ")}`,
          p_description: p.message_en,
          p_action_payload: {
            action: "proactive_message",
            params: {
              message: p.message_en,
              message_pl: p.message_pl,
              prediction_metric: p.metric,
              prediction_severity: p.severity,
            },
          },
          p_priority: severityToPriority(p.severity),
          p_source_agent: "prediction-engine",
          p_requires_approval: requiresApproval,
          p_scheduled_for: null,
        },
      );

      if (error) {
        console.error("[Predictions] Failed to create intervention:", {
          tenantId: p.tenantId,
          metric: p.metric,
          error: error.message,
        });
        continue;
      }

      // Link intervention to prediction
      if (interventionId) {
        await supabase
          .from("exo_predictions")
          .update({ intervention_id: interventionId })
          .eq("tenant_id", p.tenantId)
          .eq("metric", p.metric)
          .is("intervention_id", null)
          .order("created_at", { ascending: false })
          .limit(1);
      }

      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Predictions] Intervention creation error:", {
        tenantId: p.tenantId,
        metric: p.metric,
        error: msg,
      });
    }
  }

  return created;
}
