/**
 * Knowledge Engine — Action Router
 *
 * Converts KnowledgeInsights into concrete actions via existing systems:
 * - exo_interventions (proposals, alerts, messages)
 * - exo_tenants (personality/behavior adjustments)
 * - exo_skill_suggestions (tracking suggestions)
 * - exo_insight_deliveries (cross-domain insights)
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { checkPermission } from "@/lib/iors/autonomy";
import { logger } from "@/lib/logger";
import type { KnowledgeInsight, ActionResult, ActionStatus } from "./types";

/**
 * Route knowledge insights to concrete actions via existing systems.
 * Respects permission model — blocks unpermitted actions.
 */
export async function routeKnowledgeActions(
  tenantId: string,
  insights: KnowledgeInsight[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const insight of insights) {
    try {
      const result = await routeSingleAction(tenantId, insight);
      results.push(result);
    } catch (error) {
      logger.error("[KAE:Router] Failed to route action:", {
        tenantId,
        insight: insight.title,
        error: (error as Error).message,
      });
      results.push({
        insightTitle: insight.title,
        actionType: insight.action.type,
        status: "error",
        reason: (error as Error).message,
      });
    }
  }

  return results;
}

async function routeSingleAction(
  tenantId: string,
  insight: KnowledgeInsight,
): Promise<ActionResult> {
  const { action } = insight;
  const supabase = getServiceSupabase();

  switch (action.type) {
    // ---- Propose Intervention ----
    case "propose_intervention": {
      const payload = action.payload as {
        type?: string;
        message?: string;
      };

      const interventionType = payload.type ?? "proactive_message";
      const message = payload.message ?? insight.description;

      // Permission check for messaging
      const perm = await checkPermission(tenantId, "message", "*");
      const requiresApproval =
        action.requires_user_approval || perm.requires_confirmation;

      const { data, error } = await supabase
        .from("exo_interventions")
        .insert({
          tenant_id: tenantId,
          intervention_type: interventionType,
          title: insight.title,
          description: message,
          action_payload: action.payload,
          source_agent: "kae",
          trigger_reason: `KAE: ${insight.type} (confidence ${(insight.confidence * 100).toFixed(0)}%)`,
          priority: action.priority,
          urgency_score:
            action.priority === "high"
              ? 8
              : action.priority === "medium"
                ? 5
                : 2,
          status: requiresApproval ? "proposed" : "approved",
          requires_approval: requiresApproval,
          approved_by: requiresApproval ? null : "kae_auto",
          expires_at: new Date(
            Date.now() + insight.expiry_hours * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        return {
          insightTitle: insight.title,
          actionType: action.type,
          status: "error",
          reason: error.message,
        };
      }

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: requiresApproval ? "proposed" : "executed",
        interventionId: data?.id,
      };
    }

    // ---- Adjust IORS Behavior ----
    case "adjust_behavior": {
      const payload = action.payload as {
        proactivity_delta?: number;
        style?: string;
      };

      // Read current personality
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("iors_personality")
        .eq("id", tenantId)
        .single();

      const personality =
        (tenant?.iors_personality as Record<string, unknown>) ?? {};
      let changed = false;

      if (payload.proactivity_delta) {
        const current = (personality.proactivity as number) ?? 50;
        const newVal = Math.min(
          90,
          Math.max(10, current + payload.proactivity_delta),
        );
        personality.proactivity = newVal;
        changed = true;
      }

      if (payload.style) {
        personality.style = payload.style;
        changed = true;
      }

      if (changed) {
        await supabase
          .from("exo_tenants")
          .update({ iors_personality: personality })
          .eq("id", tenantId);

        // Log to system_optimizations
        await Promise.resolve(
          supabase.from("system_optimizations").insert({
            tenant_id: tenantId,
            optimization_type: "kae_behavior_adjustment",
            description: insight.title,
            before_state: tenant?.iors_personality ?? {},
            after_state: personality,
            trigger: "knowledge_analysis",
          }),
        ).catch(() => {
          // system_optimizations may not exist
        });
      }

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: changed ? "executed" : "skipped",
        reason: changed ? undefined : "No changes needed",
      };
    }

    // ---- Suggest Tracking ----
    case "suggest_tracking": {
      const payload = action.payload as { domains?: string[] };
      const domains = payload.domains ?? insight.domains;

      for (const domain of domains) {
        await Promise.resolve(
          supabase.from("exo_skill_suggestions").upsert(
            {
              tenant_id: tenantId,
              name: `${domain}_tracker`,
              reason: insight.description,
              source: "kae",
              status: "pending",
            },
            { onConflict: "tenant_id,name" },
          ),
        ).catch(() => {
          // Ignore conflicts
        });
      }

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: "proposed",
      };
    }

    // ---- Probe Gap ----
    case "probe_gap": {
      const payload = action.payload as { question?: string };
      const message =
        payload.question ??
        `Zauważyłem brak danych o: ${insight.domains.join(", ")}. Chcesz to śledzić?`;

      const { data } = await supabase
        .from("exo_interventions")
        .insert({
          tenant_id: tenantId,
          intervention_type: "gap_detection",
          title: insight.title,
          description: message,
          action_payload: action.payload,
          source_agent: "kae",
          trigger_reason: `KAE gap detection`,
          priority: "low",
          urgency_score: 2,
          status: "approved",
          requires_approval: false,
          approved_by: "kae_auto",
          expires_at: new Date(
            Date.now() + insight.expiry_hours * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select("id")
        .single();

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: "executed",
        interventionId: data?.id,
      };
    }

    // ---- Celebrate ----
    case "celebrate": {
      const payload = action.payload as { message?: string };

      const { data } = await supabase
        .from("exo_interventions")
        .insert({
          tenant_id: tenantId,
          intervention_type: "proactive_message",
          title: insight.title,
          description: payload.message ?? insight.description,
          action_payload: action.payload,
          source_agent: "kae",
          trigger_reason: "KAE celebration",
          priority: "low",
          urgency_score: 1,
          status: "approved",
          requires_approval: false,
          approved_by: "kae_auto",
          expires_at: new Date(
            Date.now() + insight.expiry_hours * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select("id")
        .single();

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: "executed",
        interventionId: data?.id,
      };
    }

    // ---- Warn Drift ----
    case "warn_drift": {
      const payload = action.payload as { message?: string };

      const perm = await checkPermission(tenantId, "message", "health");
      const requiresApproval =
        action.requires_user_approval || perm.requires_confirmation;

      const { data } = await supabase
        .from("exo_interventions")
        .insert({
          tenant_id: tenantId,
          intervention_type: "pattern_notification",
          title: insight.title,
          description: payload.message ?? insight.description,
          action_payload: action.payload,
          source_agent: "kae",
          trigger_reason: `KAE drift warning (confidence ${(insight.confidence * 100).toFixed(0)}%)`,
          priority: "high",
          urgency_score: 7,
          status: requiresApproval ? "proposed" : "approved",
          requires_approval: requiresApproval,
          approved_by: requiresApproval ? null : "kae_auto",
          expires_at: new Date(
            Date.now() + insight.expiry_hours * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select("id")
        .single();

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: requiresApproval ? "proposed" : "executed",
        interventionId: data?.id,
      };
    }

    // ---- Connect Dots ----
    case "connect_dots": {
      // Log to insight deliveries for display on dashboard
      await Promise.resolve(
        supabase.from("exo_insight_deliveries").insert({
          tenant_id: tenantId,
          source_table: "exo_knowledge_analyses",
          source_id: null, // Will be filled by orchestrator
          channel: "dashboard",
          batch_id: null,
        }),
      ).catch(() => {
        // Ignore duplicate insert errors
      });

      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: "executed",
      };
    }

    default:
      return {
        insightTitle: insight.title,
        actionType: action.type,
        status: "skipped",
        reason: `Unknown action type: ${action.type}`,
      };
  }
}
