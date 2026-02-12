/**
 * Ralph Loop Engine — Autonomous Development Cycle
 *
 * Self-development loop that runs inside loop-15 CRON:
 * OBSERVE → ANALYZE → PLAN → BUILD → TEST → LEARN
 *
 * Uses Gemini Flash for ANALYZE (cheap, ~1-2s) and existing
 * IORS tools (build_app, manage_canvas) for BUILD.
 *
 * Budget: max 1 build + 2 fixes per 15-min cycle.
 * All actions logged to exo_dev_journal.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ModelRouter } from "@/lib/ai/model-router";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

interface RalphObservation {
  failurePatterns: FailurePattern[];
  pendingPlans: PendingPlan[];
  detectedGaps: DetectedGap[];
  unusedApps: UnusedApp[];
  userPriorities: UserPriority[];
}

interface FailurePattern {
  toolName: string;
  failCount: number;
  lastError: string;
  lastFailedAt: string;
}

interface PendingPlan {
  id: string;
  title: string;
  details: Record<string, unknown>;
}

interface DetectedGap {
  id: string;
  gap_type: string;
  description: string;
}

interface UnusedApp {
  slug: string;
  name: string;
  lastUsedDaysAgo: number;
}

interface UserPriority {
  id: string;
  title: string;
  urgency: string;
}

interface RalphAction {
  type: "build_app" | "fix_tool" | "optimize" | "register_tool" | "none";
  description: string;
  params: Record<string, unknown>;
}

export interface RalphCycleResult {
  observed: {
    failures: number;
    pendingPlans: number;
    gaps: number;
    unusedApps: number;
    priorities: number;
  };
  action: RalphAction;
  outcome: "success" | "failed" | "skipped";
  durationMs: number;
  journalEntryId?: string;
}

// ============================================================================
// MAIN CYCLE
// ============================================================================

/**
 * Run one Ralph Loop cycle for a tenant.
 * Called from loop-15 CRON after tenant evaluation.
 *
 * @param tenantId - Tenant to evaluate
 * @param budgetMs - Time budget remaining (from CRON)
 */
export async function runRalphCycle(
  tenantId: string,
  budgetMs: number = 20_000,
): Promise<RalphCycleResult> {
  const startTime = performance.now();

  try {
    // ── Step 1: OBSERVE ──
    const observation = await observe(tenantId);

    const observedStats = {
      failures: observation.failurePatterns.length,
      pendingPlans: observation.pendingPlans.length,
      gaps: observation.detectedGaps.length,
      unusedApps: observation.unusedApps.length,
      priorities: observation.userPriorities.length,
    };

    // Nothing to do?
    const totalSignals =
      observedStats.failures +
      observedStats.pendingPlans +
      observedStats.gaps +
      observedStats.priorities;

    if (totalSignals === 0) {
      return {
        observed: observedStats,
        action: {
          type: "none",
          description: "Brak sygnałów do działania",
          params: {},
        },
        outcome: "skipped",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // Budget check
    if (performance.now() - startTime > budgetMs - 5000) {
      return {
        observed: observedStats,
        action: {
          type: "none",
          description: "Brak budżetu czasowego",
          params: {},
        },
        outcome: "skipped",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // ── Step 2: ANALYZE (Gemini Flash — cheap, ~1-2s) ──
    const action = await analyze(tenantId, observation);

    if (action.type === "none") {
      return {
        observed: observedStats,
        action,
        outcome: "skipped",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // Budget check before BUILD
    if (performance.now() - startTime > budgetMs - 8000) {
      // Save plan for next cycle
      await logToJournal(
        tenantId,
        "plan",
        action.description,
        {
          action,
          deferred: true,
          reason: "budget_exhausted",
        },
        "pending",
      );

      return {
        observed: observedStats,
        action,
        outcome: "skipped",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // ── Step 3: BUILD ──
    const buildResult = await build(tenantId, action);

    // ── Step 4: LEARN ──
    const journalEntryId = await learn(tenantId, action, buildResult);

    return {
      observed: observedStats,
      action,
      outcome: buildResult.success ? "success" : "failed",
      durationMs: Math.round(performance.now() - startTime),
      journalEntryId,
    };
  } catch (error) {
    console.error("[RalphLoop] Cycle failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });

    return {
      observed: {
        failures: 0,
        pendingPlans: 0,
        gaps: 0,
        unusedApps: 0,
        priorities: 0,
      },
      action: { type: "none", description: "Cycle failed", params: {} },
      outcome: "failed",
      durationMs: Math.round(performance.now() - startTime),
    };
  }
}

// ============================================================================
// OBSERVE — Collect signals from the system
// ============================================================================

async function observe(tenantId: string): Promise<RalphObservation> {
  const supabase = getServiceSupabase();

  const [
    failureResult,
    pendingPlansResult,
    gapsResult,
    unusedAppsResult,
    prioritiesResult,
  ] = await Promise.all([
    // Tool failures in last 24h
    supabase
      .from("exo_tool_executions")
      .select("tool_name, error_message, created_at")
      .eq("tenant_id", tenantId)
      .eq("success", false)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(50),

    // Pending plans from dev journal
    supabase
      .from("exo_dev_journal")
      .select("id, title, details")
      .eq("tenant_id", tenantId)
      .eq("entry_type", "plan")
      .eq("outcome", "pending")
      .order("created_at", { ascending: false })
      .limit(5),

    // Detected gaps
    supabase
      .from("exo_gap_detections")
      .select("id, gap_type, description")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(10),

    // Unused apps (no usage in 14+ days)
    supabase
      .from("exo_generated_apps")
      .select("slug, name, last_used_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(10),

    // User priorities (recent plan entries with source: user_instruction)
    supabase
      .from("exo_dev_journal")
      .select("id, title, details")
      .eq("tenant_id", tenantId)
      .eq("entry_type", "plan")
      .eq("outcome", "pending")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Aggregate failure patterns (3+ failures = pattern)
  const failureCounts = new Map<
    string,
    { count: number; lastError: string; lastAt: string }
  >();
  for (const f of failureResult.data || []) {
    const existing = failureCounts.get(f.tool_name);
    if (existing) {
      existing.count++;
    } else {
      failureCounts.set(f.tool_name, {
        count: 1,
        lastError: f.error_message || "Unknown",
        lastAt: f.created_at,
      });
    }
  }

  const failurePatterns: FailurePattern[] = [];
  for (const [toolName, data] of failureCounts) {
    if (data.count >= 3) {
      failurePatterns.push({
        toolName,
        failCount: data.count,
        lastError: data.lastError,
        lastFailedAt: data.lastAt,
      });
    }
  }

  // Filter unused apps (14+ days)
  const now = Date.now();
  const unusedApps: UnusedApp[] = (unusedAppsResult.data || [])
    .filter((app) => {
      if (!app.last_used_at) return true; // Never used
      const daysSince =
        (now - new Date(app.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 14;
    })
    .map((app) => ({
      slug: app.slug,
      name: app.name,
      lastUsedDaysAgo: app.last_used_at
        ? Math.round(
            (now - new Date(app.last_used_at).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 999,
    }));

  // User priorities (filter by source: user_instruction)
  const userPriorities: UserPriority[] = (prioritiesResult.data || [])
    .filter(
      (p) =>
        (p.details as Record<string, unknown>)?.source === "user_instruction",
    )
    .map((p) => ({
      id: p.id,
      title: p.title,
      urgency:
        ((p.details as Record<string, unknown>)?.urgency as string) || "medium",
    }));

  return {
    failurePatterns,
    pendingPlans: (pendingPlansResult.data || []).map((p) => ({
      id: p.id,
      title: p.title,
      details: p.details as Record<string, unknown>,
    })),
    detectedGaps: (gapsResult.data || []).map((g) => ({
      id: g.id,
      gap_type: g.gap_type,
      description: g.description,
    })),
    unusedApps,
    userPriorities,
  };
}

// ============================================================================
// ANALYZE — Determine what action to take (Gemini Flash)
// ============================================================================

async function analyze(
  tenantId: string,
  obs: RalphObservation,
): Promise<RalphAction> {
  const router = new ModelRouter();

  const prompt = `You are the ExoSkull self-development engine. Analyze these signals and decide ONE action.

## Signals

Failure patterns (tools failing 3+ times in 24h):
${obs.failurePatterns.length > 0 ? obs.failurePatterns.map((f) => `- ${f.toolName}: ${f.failCount}x, last error: ${f.lastError}`).join("\n") : "None"}

Pending plans:
${obs.pendingPlans.length > 0 ? obs.pendingPlans.map((p) => `- ${p.title}`).join("\n") : "None"}

Detected gaps (things user needs but doesn't have):
${obs.detectedGaps.length > 0 ? obs.detectedGaps.map((g) => `- [${g.gap_type}] ${g.description}`).join("\n") : "None"}

Unused apps (14+ days):
${obs.unusedApps.length > 0 ? obs.unusedApps.map((a) => `- ${a.name} (${a.lastUsedDaysAgo} days)`).join("\n") : "None"}

User priorities:
${obs.userPriorities.length > 0 ? obs.userPriorities.map((p) => `- [${p.urgency}] ${p.title}`).join("\n") : "None"}

## Decision Priority
1. User priorities (high urgency first)
2. Fix failing tools (3+ failures = broken)
3. Build apps for detected gaps
4. Optimize unused apps
5. Execute pending plans

## Response Format (STRICT JSON)
{
  "type": "build_app" | "fix_tool" | "optimize" | "register_tool" | "none",
  "description": "what and why",
  "params": { ... action-specific parameters ... }
}

For "build_app": params = { "description": "app description for generator", "source_gap": "gap_id or null" }
For "fix_tool": params = { "tool_name": "...", "error_pattern": "...", "remediation": "description" }
For "optimize": params = { "target": "app slug or tool name", "optimization": "what to improve" }
For "register_tool": params = { "name": "...", "description": "...", "handler_type": "...", "handler_config": {} }
For "none": params = {}

Return ONLY JSON.`;

  try {
    const response = await router.route({
      messages: [{ role: "user", content: prompt }],
      taskCategory: "classification", // Tier 1: Gemini Flash
      tenantId,
      maxTokens: 300,
      temperature: 0.2,
    });

    const parsed = JSON.parse(
      response.content.replace(/```json?\n?/g, "").replace(/```/g, ""),
    );

    return {
      type: parsed.type || "none",
      description: parsed.description || "",
      params: parsed.params || {},
    };
  } catch (error) {
    console.error("[RalphLoop:Analyze] AI analysis failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });

    // Fallback: if we have user priorities, build for the first one
    if (obs.userPriorities.length > 0) {
      return {
        type: "build_app",
        description: `Priorytet użytkownika: ${obs.userPriorities[0].title}`,
        params: {
          description: obs.userPriorities[0].title,
          source_gap: null,
        },
      };
    }

    return { type: "none", description: "Analysis failed", params: {} };
  }
}

// ============================================================================
// BUILD — Execute the decided action
// ============================================================================

async function build(
  tenantId: string,
  action: RalphAction,
): Promise<{ success: boolean; result?: string; error?: string }> {
  const supabase = getServiceSupabase();

  switch (action.type) {
    case "build_app": {
      try {
        const { generateApp } =
          await import("@/lib/apps/generator/app-generator");
        const result = await generateApp({
          tenant_id: tenantId,
          description:
            (action.params.description as string) || action.description,
          source: "iors_suggestion",
        });

        if (result.success && result.app) {
          return {
            success: true,
            result: `Zbudowano: ${result.app.name} (${result.app.slug})`,
          };
        }
        return {
          success: false,
          error: result.error || "App generation failed",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Build failed",
        };
      }
    }

    case "fix_tool": {
      // For now: log the fix recommendation, disable broken tool
      const toolName = action.params.tool_name as string;
      if (!toolName) return { success: false, error: "No tool_name specified" };

      // Check if it's a dynamic tool we can disable
      const { data } = await supabase
        .from("exo_dynamic_tools")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", toolName)
        .single();

      if (data) {
        await supabase
          .from("exo_dynamic_tools")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", data.id);

        return {
          success: true,
          result: `Wyłączono uszkodzony tool: ${toolName}. Remediation: ${action.params.remediation || "manual review needed"}`,
        };
      }

      // Static tool — can't disable, just log
      return {
        success: true,
        result: `Zidentyfikowano problem z ${toolName}: ${action.params.error_pattern}. Remediation: ${action.params.remediation}`,
      };
    }

    case "register_tool": {
      const { error } = await supabase.from("exo_dynamic_tools").insert({
        tenant_id: tenantId,
        name: action.params.name as string,
        description: action.params.description as string,
        input_schema: action.params.input_schema || {},
        handler_type: action.params.handler_type as string,
        handler_config: action.params.handler_config || {},
      });

      if (error) {
        return {
          success: false,
          error: `Tool registration failed: ${error.message}`,
        };
      }
      return {
        success: true,
        result: `Zarejestrowano nowy tool: ${action.params.name}`,
      };
    }

    case "optimize": {
      // Log optimization recommendation
      return {
        success: true,
        result: `Optymalizacja zaplanowana: ${action.params.target} — ${action.params.optimization}`,
      };
    }

    default:
      return { success: false, error: "Unknown action type" };
  }
}

// ============================================================================
// LEARN — Log outcome to dev journal
// ============================================================================

async function learn(
  tenantId: string,
  action: RalphAction,
  buildResult: { success: boolean; result?: string; error?: string },
): Promise<string | undefined> {
  const entryType = buildResult.success ? "build" : "fix";
  const outcome = buildResult.success ? "success" : "failed";

  return logToJournal(
    tenantId,
    entryType,
    action.description,
    {
      action_type: action.type,
      params: action.params,
      result: buildResult.result,
      error: buildResult.error,
    },
    outcome,
    action.type === "build_app"
      ? `app:${action.params.description}`
      : undefined,
  );
}

// ============================================================================
// HELPERS
// ============================================================================

async function logToJournal(
  tenantId: string,
  entryType: string,
  title: string,
  details: Record<string, unknown>,
  outcome: string,
  relatedEntity?: string,
): Promise<string | undefined> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_dev_journal")
    .insert({
      tenant_id: tenantId,
      entry_type: entryType,
      title,
      details,
      outcome,
      related_entity: relatedEntity || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[RalphLoop:Journal] Failed to log:", {
      tenantId,
      error: error.message,
    });
    return undefined;
  }

  return data?.id;
}
