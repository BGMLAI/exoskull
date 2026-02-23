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
import { readFile } from "fs/promises";
import { join } from "path";
import { emitSystemEvent } from "@/lib/system/events";
import { getManifestSummaryForPrompt } from "@/lib/system/manifest";
import {
  emitRalphEvent,
  emitSwarmEvent,
  emitAtlasEvent,
} from "@/lib/system/inter-system-bus";
import {
  buildGOTCHAContext,
  buildGOTCHAPrompt,
} from "@/lib/system/gotcha-engine";
import {
  createSwarmSession,
  runSwarmCycle,
  persistSwarmResults,
} from "@/lib/system/agent-swarm";
import { runFullPipeline } from "@/lib/system/atlas-pipeline";
import {
  suggestSelfBuildActions,
  executeSelfBuild,
} from "@/lib/system/self-builder";
import {
  modifySource,
  type SourceModRequest,
} from "@/lib/self-modification/source-engine";
import {
  coordinateSourceSwarm,
  isComplexModification,
} from "@/lib/self-modification/swarm-coordinator";

// ============================================================================
// TYPES
// ============================================================================

interface RalphObservation {
  failurePatterns: FailurePattern[];
  pendingPlans: PendingPlan[];
  detectedGaps: DetectedGap[];
  unusedApps: UnusedApp[];
  userPriorities: UserPriority[];
  gotchaContext: {
    goalsManifest: string | null;
    toolsManifest: string | null;
  };
  /** System manifest summary — full self-awareness of all components */
  manifestSummary: string;
  /** Consecutive stuck cycles (no progress) — triggers lateral thinking */
  stuckCycles: number;
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
  type:
    | "build_app"
    | "fix_tool"
    | "optimize"
    | "register_tool"
    | "heal_integration"
    | "generate_content"
    | "lateral_experiment"
    | "evolve_source"
    | "none";
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
  const correlationId = `ralph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // ── Emit cycle start on system bus ──
  emitRalphEvent(
    "cycle.started",
    tenantId,
    {
      budgetMs,
      correlationId,
    },
    correlationId,
  );

  try {
    // ── Step 0: GOTCHA CONTEXT ──
    // Load full framework context (goals, tools, user context, args)
    let gotchaPromptEnrichment = "";
    try {
      const gotchaContext = await buildGOTCHAContext(tenantId);
      gotchaPromptEnrichment = buildGOTCHAPrompt(
        gotchaContext,
        "Ralph Loop autonomous cycle",
      );
    } catch (err) {
      // Non-critical — continue without GOTCHA enrichment
      logger.warn("[RalphLoop] GOTCHA context load failed:", {
        tenantId,
        error: err instanceof Error ? err.message : err,
      });
    }

    // ── Step 1: OBSERVE ──
    const observation = await observe(tenantId);

    const observedStats = {
      failures: observation.failurePatterns.length,
      pendingPlans: observation.pendingPlans.length,
      gaps: observation.detectedGaps.length,
      unusedApps: observation.unusedApps.length,
      priorities: observation.userPriorities.length,
    };

    // ── Step 1b: SELF-BUILD suggestions ──
    // Check if the system should modify its own dashboard
    let selfBuildSuggestions: Awaited<
      ReturnType<typeof suggestSelfBuildActions>
    > = [];
    try {
      selfBuildSuggestions = await suggestSelfBuildActions(tenantId);
      // Execute auto-suggestions (non-blocking)
      for (const suggestion of selfBuildSuggestions.slice(0, 2)) {
        executeSelfBuild(tenantId, suggestion).catch((err) => {
          logger.warn("[RalphLoop] Self-build suggestion failed:", {
            action: suggestion.type,
            error: err instanceof Error ? err.message : err,
          });
        });
      }
    } catch {
      // Non-critical
    }

    // Nothing to do?
    const totalSignals =
      observedStats.failures +
      observedStats.pendingPlans +
      observedStats.gaps +
      observedStats.priorities;

    if (totalSignals === 0) {
      emitRalphEvent(
        "cycle.completed",
        tenantId,
        {
          outcome: "skipped",
          reason: "no_signals",
          selfBuildSuggestions: selfBuildSuggestions.length,
        },
        correlationId,
      );

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
    // Enhanced with GOTCHA context
    const action = await analyze(tenantId, observation, gotchaPromptEnrichment);

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

    // ── Step 3: BUILD (with Swarm/ATLAS integration) ──
    emitRalphEvent(
      "action.started",
      tenantId,
      {
        actionType: action.type,
        description: action.description,
      },
      correlationId,
    );

    const buildResult = await buildEnhanced(tenantId, action, correlationId);

    // Emit system event for observability
    emitSystemEvent({
      tenantId,
      eventType: buildResult.success ? "ralph_cycle_completed" : "build_failed",
      component: "ralph_loop",
      severity: buildResult.success ? "info" : "warn",
      message: buildResult.success
        ? `Ralph built: ${action.description}`
        : `Ralph build failed: ${buildResult.error || action.description}`,
      details: {
        actionType: action.type,
        params: action.params,
        result: buildResult.result,
        error: buildResult.error,
      },
    });

    emitRalphEvent(
      "action.completed",
      tenantId,
      {
        actionType: action.type,
        success: buildResult.success,
        result: buildResult.result?.slice(0, 200),
      },
      correlationId,
    );

    // ── Step 4: LEARN ──
    const journalEntryId = await learn(tenantId, action, buildResult);

    // ── Step 5: NOTIFY (Chat Rzeka system_evolution) ──
    if (buildResult.success) {
      await notifyUser(tenantId, action, buildResult, journalEntryId);
    }

    emitRalphEvent(
      "cycle.completed",
      tenantId,
      {
        outcome: buildResult.success ? "success" : "failed",
        actionType: action.type,
        durationMs: Math.round(performance.now() - startTime),
      },
      correlationId,
    );

    return {
      observed: observedStats,
      action,
      outcome: buildResult.success ? "success" : "failed",
      durationMs: Math.round(performance.now() - startTime),
      journalEntryId,
    };
  } catch (error) {
    logger.error("[RalphLoop] Cycle failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });

    emitRalphEvent(
      "cycle.failed",
      tenantId,
      {
        error: error instanceof Error ? error.message : String(error),
      },
      correlationId,
    );

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
// GOTCHA — Load goals/ and tools/ manifests for self-awareness
// ============================================================================

async function loadGotchaManifests(): Promise<{
  goalsManifest: string | null;
  toolsManifest: string | null;
}> {
  const rootDir = process.cwd();
  const [goals, tools] = await Promise.all([
    readFile(join(rootDir, "goals", "manifest.md"), "utf-8").catch(() => null),
    readFile(join(rootDir, "tools", "manifest.md"), "utf-8").catch(() => null),
  ]);
  return {
    goalsManifest: goals ? goals.slice(0, 2000) : null,
    toolsManifest: tools ? tools.slice(0, 2000) : null,
  };
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

    // Detected gaps — infer from proactive_log (no dedicated gap table)
    supabase
      .from("exo_proactive_log")
      .select("id, trigger_type, metadata, created_at")
      .eq("tenant_id", tenantId)
      .like("trigger_type", "auto_build:%")
      .gte(
        "created_at",
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
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

  // Load GOTCHA manifests for self-awareness
  const gotchaContext = await loadGotchaManifests();

  // Load system manifest summary for full self-awareness
  const manifestSummary = await getManifestSummaryForPrompt(tenantId);

  // Count consecutive stuck cycles (skipped outcomes in recent journal)
  const { data: recentJournal } = await supabase
    .from("exo_dev_journal")
    .select("outcome")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  let stuckCycles = 0;
  for (const entry of recentJournal || []) {
    if (entry.outcome === "skipped" || entry.outcome === "failed") {
      stuckCycles++;
    } else {
      break;
    }
  }

  // Enrich detected gaps with goal-capability gaps (top-down from goals)
  const goalCapabilityGaps: DetectedGap[] = [];
  try {
    const { analyzeAllGoalCapabilities } =
      await import("@/lib/goals/capability-analyzer");
    const capReports = await analyzeAllGoalCapabilities(tenantId);
    for (const report of capReports) {
      for (const mc of report.missingCapabilities.slice(0, 2)) {
        goalCapabilityGaps.push({
          id: `goal-cap:${report.goalId}:${mc.type}`,
          gap_type: `goal_${mc.type}`,
          description: `${mc.description} → ${mc.suggestedAction}`,
        });
      }
    }
  } catch {
    // Non-critical — continue without goal-capability gaps
  }

  const allGaps = [
    ...(gapsResult.data || []).map((g) => ({
      id: g.id,
      gap_type:
        (g.trigger_type as string)?.replace("auto_build:", "") || "unknown",
      description:
        ((g.metadata as Record<string, unknown>)?.description as string) ||
        (g.trigger_type as string),
    })),
    ...goalCapabilityGaps,
  ];

  return {
    failurePatterns,
    pendingPlans: (pendingPlansResult.data || []).map((p) => ({
      id: p.id,
      title: p.title,
      details: p.details as Record<string, unknown>,
    })),
    detectedGaps: allGaps,
    unusedApps,
    userPriorities,
    gotchaContext,
    manifestSummary,
    stuckCycles,
  };
}

// ============================================================================
// ANALYZE — Determine what action to take (Gemini Flash)
// ============================================================================

async function analyze(
  tenantId: string,
  obs: RalphObservation,
  gotchaEnrichment: string = "",
): Promise<RalphAction> {
  const router = new ModelRouter();

  // If stuck 3+ cycles, inject lateral thinking instructions
  const lateralThinking =
    obs.stuckCycles >= 3
      ? `\n## LATERAL THINKING MODE (stuck ${obs.stuckCycles} cycles)
You've been stuck. Try something UNEXPECTED:
- Use "lateral_experiment": pick a random combination of existing tools
- Reverse the problem: what would make things WORSE? Do the opposite
- Cross-domain: apply a solution from a completely different area
- De Bono "Po": start from a deliberately wrong assumption and see where it leads
PREFER "lateral_experiment" type when stuck.\n`
      : "";

  const prompt = `You are the ExoSkull self-development engine (Ralph Loop). Analyze signals and decide ONE action.

${gotchaEnrichment ? `${gotchaEnrichment}\n\n` : ""}## System Self-Awareness
${obs.manifestSummary}

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

${obs.gotchaContext.goalsManifest ? `## GOTCHA Goals (available workflows)\n${obs.gotchaContext.goalsManifest}\n` : ""}${obs.gotchaContext.toolsManifest ? `## GOTCHA Tools (available scripts)\n${obs.gotchaContext.toolsManifest}\n` : ""}${lateralThinking}
## Decision Priority
1. User priorities (high urgency first)
2. Heal broken integrations (reconnect, re-auth)
3. Fix failing tools (3+ failures = broken)
4. Build apps for detected gaps
5. Generate content user needs
6. Optimize unused apps
7. Execute pending plans

## Response Format (STRICT JSON)
{
  "type": "build_app" | "fix_tool" | "optimize" | "register_tool" | "heal_integration" | "generate_content" | "lateral_experiment" | "evolve_source" | "none",
  "description": "what and why",
  "params": { ... action-specific parameters ... }
}

For "build_app": params = { "description": "app description", "source_gap": "gap_id or null" }
For "fix_tool": params = { "tool_name": "...", "error_pattern": "...", "remediation": "description" }
For "optimize": params = { "target": "app slug or tool name", "optimization": "what to improve" }
For "register_tool": params = { "name": "...", "description": "...", "handler_type": "...", "handler_config": {} }
For "heal_integration": params = { "integration_name": "...", "issue": "...", "strategy": "reconnect|re_auth|retry" }
For "generate_content": params = { "content_type": "document|presentation|post|email", "description": "...", "target_channel": "..." }
For "lateral_experiment": params = { "hypothesis": "what you're testing", "method": "random_combo|reverse|cross_domain|po_technique" }
For "evolve_source": params = { "description": "what source change to make and why", "targetFiles": ["relative/path/to/file.ts"], "context": "additional context" }
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
    logger.error("[RalphLoop:Analyze] AI analysis failed:", {
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

/**
 * Enhanced build that routes complex tasks to Agent Swarm
 * and app builds through ATLAS Pipeline.
 */
async function buildEnhanced(
  tenantId: string,
  action: RalphAction,
  correlationId: string,
): Promise<{ success: boolean; result?: string; error?: string }> {
  // Determine if this task is complex enough for the Swarm
  const isComplex = isComplexTask(action);

  if (isComplex && action.type !== "lateral_experiment") {
    return buildWithSwarm(tenantId, action, correlationId);
  }

  return build(tenantId, action);
}

/**
 * Heuristic: Is this task complex enough to warrant multi-agent coordination?
 */
function isComplexTask(action: RalphAction): boolean {
  // App builds with detailed requirements → use ATLAS + Swarm
  if (action.type === "build_app") {
    const desc = (action.params.description as string) || action.description;
    return desc.length > 100; // Longer descriptions = more complex
  }

  // Multi-step fixes with clear remediation plans → Swarm
  if (action.type === "fix_tool" && action.params.remediation) {
    return String(action.params.remediation).length > 50;
  }

  return false;
}

/**
 * Route complex tasks through Agent Swarm for multi-agent coordination.
 * Falls back to simple build if swarm fails.
 */
async function buildWithSwarm(
  tenantId: string,
  action: RalphAction,
  correlationId: string,
): Promise<{ success: boolean; result?: string; error?: string }> {
  try {
    // For app builds, use ATLAS Pipeline first
    if (action.type === "build_app") {
      emitAtlasEvent(
        "pipeline.started",
        tenantId,
        {
          description: action.params.description || action.description,
        },
        correlationId,
      );

      try {
        const pipeline = await runFullPipeline(
          tenantId,
          (action.params.description as string) || action.description,
        );

        if (pipeline.status === "completed") {
          emitAtlasEvent(
            "pipeline.completed",
            tenantId,
            {
              pipelineId: pipeline.id,
              stages: Object.keys(pipeline.stages),
            },
            correlationId,
          );

          return {
            success: true,
            result: `ATLAS pipeline complete: ${(action.params.description as string) || action.description}. All 5 stages passed.`,
          };
        }

        emitAtlasEvent(
          "pipeline.failed",
          tenantId,
          {
            pipelineId: pipeline.id,
            error: pipeline.error,
            failedStage: pipeline.currentStage,
          },
          correlationId,
        );

        // Fall back to simple build
        logger.warn(
          "[RalphLoop] ATLAS pipeline failed, falling back to simple build",
          {
            tenantId,
            error: pipeline.error,
          },
        );
      } catch (atlasErr) {
        logger.warn("[RalphLoop] ATLAS pipeline error, falling back:", {
          tenantId,
          error: atlasErr instanceof Error ? atlasErr.message : atlasErr,
        });
      }
    }

    // For other complex tasks, use Agent Swarm
    emitSwarmEvent(
      "session.created",
      tenantId,
      {
        taskCount: 1,
        actionType: action.type,
      },
      correlationId,
    );

    const session = createSwarmSession(tenantId, [
      {
        description: action.description,
        type:
          action.type === "build_app"
            ? "build_app"
            : action.type === "fix_tool"
              ? "fix_bug"
              : action.type === "heal_integration"
                ? "heal_integration"
                : "research",
        priority: 1,
        context: action.params,
      },
    ]);

    // Run up to 3 swarm cycles
    let lastResult = { done: false, progress: "", actions: [] as string[] };
    for (let i = 0; i < 3; i++) {
      lastResult = await runSwarmCycle(session.id);
      if (lastResult.done) break;
    }

    // Persist results
    await persistSwarmResults(session.id);

    emitSwarmEvent(
      lastResult.done ? "session.completed" : "agent.stuck",
      tenantId,
      {
        sessionId: session.id,
        progress: lastResult.progress,
        actions: lastResult.actions.length,
      },
      correlationId,
    );

    if (lastResult.done) {
      return {
        success: true,
        result: `Swarm completed: ${lastResult.progress}. Actions: ${lastResult.actions.slice(0, 3).join("; ")}`,
      };
    }

    // Fall back to simple build if swarm didn't complete
    return build(tenantId, action);
  } catch (err) {
    logger.warn("[RalphLoop] Swarm execution failed, falling back:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
    // Graceful degradation: fall back to simple build
    return build(tenantId, action);
  }
}

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

      // Invalidate dynamic tool cache so next request picks it up
      try {
        const { invalidateDynamicToolCache } =
          await import("@/lib/iors/tools/dynamic-handler");
        invalidateDynamicToolCache(tenantId);
      } catch {
        // Non-critical — cache will expire naturally in 5 min
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

    case "heal_integration": {
      const integrationName = action.params.integration_name as string;
      const strategy = action.params.strategy as string;

      if (!integrationName) {
        return { success: false, error: "No integration_name specified" };
      }

      try {
        // Try to refresh integration health
        const { data: healthEntry } = await supabase
          .from("exo_integration_health")
          .select("id, status, last_error")
          .eq("provider", integrationName)
          .maybeSingle();

        if (!healthEntry) {
          return {
            success: false,
            error: `Integration ${integrationName} not found in health table`,
          };
        }

        // Log the healing attempt
        await supabase
          .from("exo_integration_health")
          .update({
            status: "degraded",
            last_check_at: new Date().toISOString(),
            metadata: {
              healing_attempt: true,
              strategy,
              attempted_at: new Date().toISOString(),
            },
          })
          .eq("id", healthEntry.id);

        return {
          success: true,
          result: `Healing ${integrationName}: strategy=${strategy}. Previous error: ${healthEntry.last_error || "none"}`,
        };
      } catch (error) {
        return {
          success: false,
          error: `Integration healing failed: ${error instanceof Error ? error.message : "unknown"}`,
        };
      }
    }

    case "generate_content": {
      const contentType = action.params.content_type as string;
      const description = action.params.description as string;

      if (!description) {
        return { success: false, error: "No content description" };
      }

      // Use code generation adapters for content generation
      try {
        const { ClaudeCodeAdapter } =
          await import("@/lib/code-generation/adapters/claude-code");
        const adapter = new ClaudeCodeAdapter(tenantId);
        const result = await adapter.execute({
          description: `Generate ${contentType}: ${description}`,
          context: {},
          requirements: [`Type: ${contentType}`, description],
          expectedOutput: { fileCount: 1, estimatedLines: 100 },
          tenantId,
        });

        if (result.success && result.files.length > 0) {
          return {
            success: true,
            result: `Wygenerowano ${contentType}: ${result.files.length} plikow. ${result.summary || ""}`,
          };
        }
        return {
          success: false,
          error: result.error || "Content generation failed",
        };
      } catch (error) {
        return {
          success: false,
          error: `Content generation failed: ${error instanceof Error ? error.message : "unknown"}`,
        };
      }
    }

    case "lateral_experiment": {
      const hypothesis = action.params.hypothesis as string;
      const method = action.params.method as string;

      // Log the experiment — don't actually build anything,
      // just record the creative insight for future cycles
      await logToJournal(
        tenantId,
        "experiment",
        `Eksperyment lateralny: ${hypothesis}`,
        {
          method,
          hypothesis,
          action_params: action.params,
          trigger: "stuck_cycles",
        },
        "pending",
        `experiment:${method}`,
      );

      return {
        success: true,
        result: `Eksperyment zalogowany: [${method}] ${hypothesis}. Wyniki w nastepnym cyklu.`,
      };
    }

    case "evolve_source": {
      const sourceRequest: SourceModRequest = {
        description:
          (action.params.description as string) || action.description,
        targetFiles: (action.params.targetFiles as string[]) || [],
        context: (action.params.context as string) || undefined,
        triggeredBy: "ralph_loop",
      };

      // Route complex modifications through Agent Swarm
      if (isComplexModification(sourceRequest)) {
        try {
          const swarmResult = await coordinateSourceSwarm(
            tenantId,
            sourceRequest,
          );
          const result = await modifySource(tenantId, {
            ...sourceRequest,
            swarmResult,
          });
          return {
            success: result.success,
            result: result.success
              ? `PR created: ${result.prUrl} (risk: ${result.riskLevel})`
              : undefined,
            error: result.blockedReason || result.error,
          };
        } catch (swarmErr) {
          // Fall back to direct modification if swarm fails
          logger.warn("[RalphLoop] Swarm failed for evolve_source, direct:", {
            error:
              swarmErr instanceof Error ? swarmErr.message : String(swarmErr),
          });
        }
      }

      const result = await modifySource(tenantId, sourceRequest);
      return {
        success: result.success,
        result: result.success
          ? `PR created: ${result.prUrl} (risk: ${result.riskLevel})`
          : undefined,
        error: result.blockedReason || result.error,
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

const EVOLUTION_LABELS: Record<string, string> = {
  build_app: "Zbudowano",
  fix_tool: "Naprawiono",
  optimize: "Zoptymalizowano",
  register_tool: "Zarejestrowano narzędzie",
  heal_integration: "Naprawiono integrację",
  generate_content: "Wygenerowano treść",
  lateral_experiment: "Eksperyment lateralny",
  evolve_source: "Ewolucja kodu źródłowego",
};

async function notifyUser(
  tenantId: string,
  action: RalphAction,
  buildResult: { success: boolean; result?: string },
  journalEntryId?: string,
): Promise<void> {
  try {
    const { sendProactiveMessage } = await import("@/lib/cron/tenant-utils");
    const label = EVOLUTION_LABELS[action.type] || action.type;
    const message = `${label}: ${buildResult.result || action.description}`;
    await sendProactiveMessage(
      tenantId,
      message,
      `ralph_${action.type}`,
      "ralph_loop",
    );
  } catch (error) {
    // Non-critical — don't break the loop
    logger.error("[RalphLoop:Notify] Failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

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
    logger.error("[RalphLoop:Journal] Failed to log:", {
      tenantId,
      error: error.message,
    });
    return undefined;
  }

  return data?.id;
}
