/**
 * Goal Strategy Engine — core brain for REALIZING user goals.
 *
 * This is the missing piece: ExoSkull tracked goals, now it ACHIEVES them.
 *
 * Flow:
 *   1. Collect ALL context about user + goal (conversations, signals, data, knowledge)
 *   2. Research optimal paths (internet, patterns, scenario analysis)
 *   3. Generate concrete executable strategy (tasks, messages, apps, skills)
 *   4. Present to user for approval
 *   5. Execute steps autonomously using existing action system
 *   6. Monitor daily, regenerate if stuck
 */

import { aiChat } from "@/lib/ai";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getGoalStatus } from "@/lib/goals/engine";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import {
  createStrategy,
  getActiveStrategy,
  getLatestStrategy,
  updateStepStatus,
  approveStrategy,
  markReviewed,
  getStrategiesNeedingReview,
} from "./strategy-store";
import type { GoalStep, GoalStrategy } from "./strategy-store";
import type { UserGoal } from "./types";
import { logger } from "@/lib/logger";

// ============================================================================
// 1. GENERATE STRATEGY
// ============================================================================

/**
 * Generate a strategy for achieving a goal.
 * Collects all available context, researches approaches, and creates a plan.
 */
export async function generateGoalStrategy(
  tenantId: string,
  goalId: string,
): Promise<GoalStrategy> {
  const supabase = getServiceSupabase();

  // Load goal
  const { data: goal } = await supabase
    .from("exo_user_goals")
    .select("*")
    .eq("id", goalId)
    .single();

  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  // Collect context in parallel
  const [userContext, goalHistory, relatedSignals, existingKnowledge] =
    await Promise.all([
      collectUserContext(supabase, tenantId),
      collectGoalHistory(supabase, goalId),
      collectRelatedSignals(supabase, tenantId, goal as UserGoal),
      collectKnowledge(supabase, tenantId, goal as UserGoal),
    ]);

  // Check for previous failed strategies
  const previousStrategy = await getLatestStrategy(goalId);
  const previousFailed =
    previousStrategy &&
    (previousStrategy.status === "abandoned" ||
      previousStrategy.status === "completed");

  // Collect existing skills/apps so AI knows what's available
  const [skillsResult, appsResult] = await Promise.all([
    supabase
      .from("exo_skill_suggestions")
      .select("suggested_slug, description")
      .eq("tenant_id", tenantId)
      .eq("status", "generated")
      .limit(10),
    supabase
      .from("exo_generated_apps")
      .select("name, category, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(10),
  ]);

  const existingCapabilities = {
    skills: (skillsResult.data || []).map(
      (s) => `${s.suggested_slug}: ${s.description}`,
    ),
    apps: (appsResult.data || []).map((a) => `${a.name} (${a.category})`),
  };

  // Capability analysis — detect what's missing for this goal
  let capabilityGaps: string | undefined;
  try {
    const { analyzeGoalCapabilities, summarizeCapabilityGaps } =
      await import("./capability-analyzer");
    const capReport = await analyzeGoalCapabilities(tenantId, goal as UserGoal);
    if (capReport.missingCapabilities.length > 0) {
      capabilityGaps = summarizeCapabilityGaps([capReport]);
    }
  } catch {
    // Non-critical — continue without capability analysis
  }

  // Generate strategy via AI
  const strategyData = await generateStrategyWithAI(
    goal as UserGoal,
    userContext,
    goalHistory,
    relatedSignals,
    existingKnowledge,
    previousStrategy,
    existingCapabilities,
    capabilityGaps,
  );

  // Persist
  const strategy = await createStrategy(tenantId, goalId, {
    approach: strategyData.approach,
    steps: strategyData.steps,
    confidence: strategyData.confidence,
    reasoning: strategyData.reasoning,
    contextSnapshot: {
      userContext: userContext.summary,
      goalHistory: goalHistory.summary,
      signalCount: relatedSignals.length,
      previousVersion: previousStrategy?.version,
    },
  });

  // Notify user
  const stepsPreview = strategyData.steps
    .slice(0, 5)
    .map(
      (s, i) => `${i + 1}. ${s.title}${s.dueDate ? ` (do ${s.dueDate})` : ""}`,
    )
    .join("\n");

  await sendProactiveMessage(
    tenantId,
    `Mam plan na cel "${goal.name}":\n\n${stepsPreview}\n\n` +
      `${strategyData.steps.length > 5 ? `...i ${strategyData.steps.length - 5} kolejnych kroków.\n\n` : ""}` +
      `Szacunek: ${strategyData.estimatedDuration}. Pewność: ${Math.round(strategyData.confidence * 100)}%.\n` +
      `Powiedz "tak" aby aktywować plan, lub opisz co zmienić.`,
    "goal_strategy_proposed",
    "strategy-engine",
  );

  logger.info("[StrategyEngine] Strategy generated:", {
    goalId,
    strategyId: strategy.id,
    steps: strategy.steps.length,
    confidence: strategy.confidence,
  });

  return strategy;
}

// ============================================================================
// 2. EXECUTE NEXT STEP
// ============================================================================

/**
 * Execute the next pending step in an active strategy.
 * Routes to appropriate executor based on step type.
 */
export async function executeNextStep(
  tenantId: string,
  goalId: string,
): Promise<{ executed: boolean; step?: GoalStep; result?: string }> {
  const strategy = await getActiveStrategy(goalId);
  if (!strategy) return { executed: false };

  // Find next pending step
  const nextIndex = strategy.steps.findIndex(
    (s, i) => i >= strategy.nextStepIndex && s.status === "pending",
  );
  if (nextIndex === -1) return { executed: false };

  const step = strategy.steps[nextIndex];

  // Mark as in_progress
  await updateStepStatus(strategy.id, nextIndex, "in_progress");

  try {
    const result = await executeStep(tenantId, strategy, step);

    await updateStepStatus(strategy.id, nextIndex, "completed", result);

    // Notify user of progress
    const remaining = strategy.steps.filter(
      (s, i) => i > nextIndex && s.status === "pending",
    ).length;
    if (remaining > 0) {
      await sendProactiveMessage(
        tenantId,
        `Krok "${step.title}" wykonany. Zostało ${remaining} kroków do celu.`,
        "goal_step_completed",
        "strategy-engine",
      );
    } else {
      await sendProactiveMessage(
        tenantId,
        `Wszystkie kroki planu wykonane! Sprawdzam czy cel został osiągnięty...`,
        "goal_strategy_completed",
        "strategy-engine",
      );
    }

    return { executed: true, step, result };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateStepStatus(strategy.id, nextIndex, "failed", undefined, errMsg);

    logger.error("[StrategyEngine] Step execution failed:", {
      strategyId: strategy.id,
      stepIndex: nextIndex,
      stepTitle: step.title,
      error: errMsg,
    });

    return { executed: false, step };
  }
}

/**
 * Route a step to the appropriate executor.
 */
async function executeStep(
  tenantId: string,
  strategy: GoalStrategy,
  step: GoalStep,
): Promise<string> {
  const { getActionExecutor } = await import("@/lib/autonomy/action-executor");
  const executor = getActionExecutor();

  switch (step.type) {
    case "create_task": {
      const result = await executor.execute({
        type: "create_task",
        tenantId,
        params: {
          title: step.params.title as string,
          description: step.params.description as string,
          dueDate: step.dueDate,
          priority: step.params.priority || "medium",
          labels: ["goal-strategy", strategy.goalId],
        },
        skipPermissionCheck: true,
      });
      return result.success
        ? `Zadanie utworzone: ${step.params.title}`
        : `Błąd: ${result.error}`;
    }

    case "send_message": {
      await sendProactiveMessage(
        tenantId,
        step.params.message as string,
        "goal_action",
        "strategy-engine",
      );
      return `Wiadomość wysłana`;
    }

    case "send_email": {
      const result = await executor.execute({
        type: "send_email",
        tenantId,
        params: {
          to: step.params.to as string,
          subject: step.params.subject as string,
          body: step.params.body as string,
        },
        skipPermissionCheck: true,
      });
      return result.success
        ? `Email wysłany do ${step.params.to}`
        : `Błąd: ${result.error}`;
    }

    case "create_event": {
      const result = await executor.execute({
        type: "create_event",
        tenantId,
        params: {
          title: step.params.title as string,
          startTime: step.params.startTime as string,
          endTime: step.params.endTime as string,
          description: step.params.description as string,
        },
        skipPermissionCheck: true,
      });
      return result.success
        ? `Wydarzenie utworzone: ${step.params.title}`
        : `Błąd: ${result.error}`;
    }

    case "schedule_reminder": {
      const result = await executor.execute({
        type: "trigger_checkin",
        tenantId,
        params: {
          checkinType: "goal_reminder",
          message: step.params.message as string,
        },
        skipPermissionCheck: true,
      });
      return result.success
        ? `Przypomnienie zaplanowane`
        : `Błąd: ${result.error}`;
    }

    case "research": {
      // Use AI to research and report back
      const researchResult = await conductResearch(
        tenantId,
        step.params.topic as string,
        step.params.context as string,
      );
      return researchResult;
    }

    case "make_call": {
      // Propose call — requires approval
      await sendProactiveMessage(
        tenantId,
        `Dla realizacji celu potrzebuję zadzwonić pod ${step.params.phone}: ${step.params.purpose}. Mam zadzwonić?`,
        "goal_call_approval",
        "strategy-engine",
      );
      return `Czekam na potwierdzenie połączenia`;
    }

    case "modify_source": {
      const { modifySource } =
        await import("@/lib/self-modification/source-engine");
      const modResult = await modifySource(tenantId, {
        description: step.title,
        targetFiles: (step.params.targetFiles as string[]) || [],
        context: step.params.context as string | undefined,
        triggeredBy: "strategy_engine",
        goalId: strategy.goalId,
      });
      return modResult.success
        ? `PR created: ${modResult.prUrl} (risk: ${modResult.riskLevel})`
        : `Blocked: ${modResult.blockedReason || modResult.error}`;
    }

    case "run_skill": {
      // Create a skill suggestion, then trigger auto-generator
      try {
        const supabase = getServiceSupabase();
        await supabase.from("exo_skill_suggestions").insert({
          tenant_id: tenantId,
          source: "goal_strategy",
          description: (step.params.description as string) || step.title,
          suggested_slug: `goal-${strategy.goalId.slice(0, 8)}-skill`,
          life_area: "other",
          confidence: 0.85,
          reasoning: `Auto-suggested from goal strategy: ${step.title}`,
          status: "pending",
        });
        // Trigger auto-generator for this tenant
        const { autoGenerateSkills } =
          await import("@/lib/skills/auto-generator");
        const genResult = await autoGenerateSkills(tenantId);
        return genResult.generated > 0
          ? `Skill wygenerowany: ${step.title}`
          : `Skill suggestion created: ${step.title}`;
      } catch (err) {
        // Fallback to task creation
        const result = await executor.execute({
          type: "create_task",
          tenantId,
          params: {
            title: `[Cel] ${step.title}`,
            description: `Typ: run_skill\n${JSON.stringify(step.params, null, 2)}`,
            priority: "high",
            labels: ["goal-strategy", strategy.goalId],
          },
          skipPermissionCheck: true,
        });
        return result.success
          ? `Zadanie utworzone (skill fallback): ${step.title}`
          : `Błąd: ${result.error}`;
      }
    }

    case "build_app": {
      // Route to app generator with goal context
      try {
        const { generateApp } =
          await import("@/lib/apps/generator/app-generator");
        const appResult = await generateApp({
          tenant_id: tenantId,
          description: (step.params.description as string) || step.title,
          source: "iors_suggestion",
        });
        return appResult.success
          ? `App wygenerowana: ${step.title}`
          : `App generation failed: ${appResult.error}`;
      } catch (err) {
        // Fallback to task creation
        const result = await executor.execute({
          type: "create_task",
          tenantId,
          params: {
            title: `[Cel] ${step.title}`,
            description: `Typ: build_app\n${JSON.stringify(step.params, null, 2)}`,
            priority: "high",
            labels: ["goal-strategy", strategy.goalId],
          },
          skipPermissionCheck: true,
        });
        return result.success
          ? `Zadanie utworzone (app fallback): ${step.title}`
          : `Błąd: ${result.error}`;
      }
    }

    case "delegate":
    case "connect_people":
    case "acquire_tool": {
      // These are complex — create tasks for them and notify user
      const result = await executor.execute({
        type: "create_task",
        tenantId,
        params: {
          title: `[Cel] ${step.title}`,
          description: `Typ: ${step.type}\n${JSON.stringify(step.params, null, 2)}`,
          priority: "high",
          labels: ["goal-strategy", strategy.goalId],
        },
        skipPermissionCheck: true,
      });
      return result.success
        ? `Zadanie złożone utworzone: ${step.title}`
        : `Błąd: ${result.error}`;
    }

    default:
      return `Nieobsługiwany typ kroku: ${step.type}`;
  }
}

// ============================================================================
// 3. REVIEW STRATEGY
// ============================================================================

/**
 * Daily strategy review — called by goal-progress CRON.
 * Checks if strategy is progressing, regenerates if stuck.
 */
export async function reviewGoalStrategy(
  tenantId: string,
  goalId: string,
): Promise<{
  needsNewPlan: boolean;
  nextStep: boolean;
  reason?: string;
}> {
  const strategy = await getActiveStrategy(goalId);

  if (!strategy) {
    return {
      needsNewPlan: true,
      nextStep: false,
      reason: "no_active_strategy",
    };
  }

  await markReviewed(strategy.id);

  // Count failed/stuck steps
  const failedSteps = strategy.steps.filter(
    (s) => s.status === "failed",
  ).length;
  const pendingSteps = strategy.steps.filter(
    (s) => s.status === "pending",
  ).length;
  const completedSteps = strategy.steps.filter(
    (s) => s.status === "completed",
  ).length;

  // All done?
  if (pendingSteps === 0 && failedSteps === 0) {
    return { needsNewPlan: false, nextStep: false, reason: "all_complete" };
  }

  // Too many failures → regenerate
  if (failedSteps >= 3) {
    logger.info("[StrategyEngine] Too many failures, regenerating:", {
      goalId,
      failedSteps,
    });
    return {
      needsNewPlan: true,
      nextStep: false,
      reason: `${failedSteps} kroków nie powiodło się`,
    };
  }

  // Stuck for 3+ days with no progress
  if (strategy.lastReviewedAt) {
    const daysSinceReview =
      (Date.now() - new Date(strategy.lastReviewedAt).getTime()) / 86400000;
    const daysSinceCreation =
      (Date.now() - new Date(strategy.createdAt).getTime()) / 86400000;

    if (daysSinceCreation > 3 && completedSteps === 0) {
      return {
        needsNewPlan: true,
        nextStep: false,
        reason: "zero postępu od 3 dni",
      };
    }
  }

  // Has pending steps → execute next
  if (pendingSteps > 0) {
    return { needsNewPlan: false, nextStep: true };
  }

  return { needsNewPlan: false, nextStep: false };
}

/**
 * Review all active strategies for a tenant.
 */
export async function reviewAllStrategies(
  tenantId: string,
): Promise<{ reviewed: number; regenerated: number; stepsExecuted: number }> {
  const strategies = await getStrategiesNeedingReview(tenantId);

  let reviewed = 0;
  let regenerated = 0;
  let stepsExecuted = 0;

  for (const strategy of strategies) {
    reviewed++;
    const review = await reviewGoalStrategy(tenantId, strategy.goalId);

    if (review.needsNewPlan) {
      try {
        await generateGoalStrategy(tenantId, strategy.goalId);
        regenerated++;
      } catch (error) {
        logger.error("[StrategyEngine] Regeneration failed:", {
          goalId: strategy.goalId,
          error: error instanceof Error ? error.message : error,
        });
      }
    } else if (review.nextStep) {
      try {
        const result = await executeNextStep(tenantId, strategy.goalId);
        if (result.executed) stepsExecuted++;
      } catch (error) {
        logger.error("[StrategyEngine] Step execution failed:", {
          goalId: strategy.goalId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  return { reviewed, regenerated, stepsExecuted };
}

// ============================================================================
// CONTEXT COLLECTORS
// ============================================================================

async function collectUserContext(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
): Promise<{ summary: string; data: Record<string, unknown> }> {
  const [tenant, recentMessages, goals, tasks] = await Promise.all([
    supabase
      .from("exo_tenants")
      .select("name, language, timezone, iors_personality, preferences")
      .eq("id", tenantId)
      .single()
      .then((r) => r.data),
    supabase
      .from("exo_unified_thread")
      .select("content, role, channel, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r) => r.data || []),
    supabase
      .from("exo_user_goals")
      .select("name, category, target_value, target_unit, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .then((r) => r.data || []),
    supabase
      .from("exo_tasks")
      .select("title, status, priority")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "in_progress"])
      .limit(10)
      .then((r) => r.data || []),
  ]);

  const summary = [
    tenant?.name ? `Użytkownik: ${tenant.name}` : "",
    `Język: ${tenant?.language || "pl"}`,
    `Aktywne cele: ${goals.length}`,
    `Aktywne zadania: ${tasks.length}`,
    `Ostatnie wiadomości: ${recentMessages.length}`,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    summary,
    data: { tenant, recentMessages: recentMessages.slice(0, 10), goals, tasks },
  };
}

async function collectGoalHistory(
  supabase: ReturnType<typeof getServiceSupabase>,
  goalId: string,
): Promise<{ summary: string; checkpoints: Record<string, unknown>[] }> {
  const { data: checkpoints } = await supabase
    .from("exo_goal_checkpoints")
    .select("value, progress_percent, momentum, trajectory, checkpoint_date")
    .eq("goal_id", goalId)
    .order("checkpoint_date", { ascending: false })
    .limit(14);

  const cps = checkpoints || [];
  const latest = cps[0];
  const summary = latest
    ? `Ostatni postęp: ${latest.progress_percent}%, trend: ${latest.momentum}, trajektoria: ${latest.trajectory}`
    : "Brak danych o postępie";

  return { summary, checkpoints: cps };
}

async function collectRelatedSignals(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  goal: UserGoal,
): Promise<Record<string, unknown>[]> {
  // Find signals related to this goal's category/name
  const { data } = await supabase
    .from("exo_signal_triage")
    .select("signal_type, subject, snippet, classification, proposed_action")
    .eq("tenant_id", tenantId)
    .eq("related_goal_id", goal.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return data || [];
}

async function collectKnowledge(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  goal: UserGoal,
): Promise<string[]> {
  // Pull relevant knowledge chunks
  const { data } = await supabase
    .from("exo_knowledge_chunks")
    .select("content, source")
    .eq("tenant_id", tenantId)
    .or(`tags.cs.{${goal.category}},content.ilike.%${goal.name.split(" ")[0]}%`)
    .limit(5);

  return (data || []).map(
    (k) => `[${k.source}] ${(k.content as string).slice(0, 200)}`,
  );
}

// ============================================================================
// AI STRATEGY GENERATION
// ============================================================================

interface StrategyAIResult {
  approach: string;
  steps: GoalStep[];
  confidence: number;
  reasoning: string;
  estimatedDuration: string;
}

async function generateStrategyWithAI(
  goal: UserGoal,
  userContext: { summary: string; data: Record<string, unknown> },
  goalHistory: { summary: string; checkpoints: Record<string, unknown>[] },
  relatedSignals: Record<string, unknown>[],
  knowledge: string[],
  previousStrategy: GoalStrategy | null,
  existingCapabilities?: { skills: string[]; apps: string[] },
  capabilityGaps?: string,
): Promise<StrategyAIResult> {
  const previousContext = previousStrategy
    ? `\n\nPOPRZEDNIA STRATEGIA (v${previousStrategy.version}, status: ${previousStrategy.status}):
Podejście: ${previousStrategy.approach}
Kroki: ${previousStrategy.steps.map((s) => `${s.title} [${s.status}]`).join(", ")}
Powód zmiany: strategia nie zadziałała — ZNAJDŹ INNĄ DROGĘ.`
    : "";

  const signalsContext =
    relatedSignals.length > 0
      ? `\nPOWIĄZANE SYGNAŁY:\n${relatedSignals.map((s) => `- [${s.signal_type}] ${s.subject}: ${s.snippet}`).join("\n")}`
      : "";

  const knowledgeContext =
    knowledge.length > 0
      ? `\nWIEDZA O UŻYTKOWNIKU:\n${knowledge.join("\n")}`
      : "";

  const capabilitiesContext =
    existingCapabilities &&
    (existingCapabilities.skills.length > 0 ||
      existingCapabilities.apps.length > 0)
      ? `\nDOSTĘPNE NARZĘDZIA:\nSkille: ${existingCapabilities.skills.join(", ") || "brak"}\nAplikacje: ${existingCapabilities.apps.join(", ") || "brak"}`
      : "";

  const response = await aiChat(
    [
      {
        role: "system",
        content: `Jesteś strategicznym planerem w systemie ExoSkull — Adaptive Life Operating System.
Twoje zadanie: wygeneruj KONKRETNY, WYKONALNY plan realizacji celu użytkownika.

ZASADY:
1. Kroki muszą być KONKRETNE i WYKONALNE przez system (nie ogólniki)
2. Każdy krok musi mieć typ z listy: create_task, send_message, send_email, make_call, create_event, schedule_reminder, research, build_app, delegate, run_skill, connect_people, acquire_tool
3. Params muszą zawierać WSZYSTKO potrzebne do wykonania (tytuł, treść, numer tel, etc.)
4. Pareto: min wysiłku → max rezultatu
5. Bierz pod uwagę KONTEKST użytkownika (język, przyzwyczajenia, aktualne zadania)
6. Jeśli poprzednia strategia nie zadziałała — ZNAJDŹ ZUPEŁNIE INNĄ DROGĘ
7. Maks 10 kroków
8. Język odpowiedzi: taki jak język celu użytkownika

Zwróć TYLKO JSON:
{
  "approach": "1-2 zdania opisujące podejście",
  "steps": [
    {
      "order": 1,
      "title": "Konkretna nazwa kroku",
      "type": "create_task|send_message|research|...",
      "params": { "odpowiednie parametry" },
      "status": "pending",
      "dueDate": "YYYY-MM-DD lub null"
    }
  ],
  "confidence": 0.0-1.0,
  "reasoning": "Dlaczego to podejście zadziała",
  "estimatedDuration": "np. 2 tygodnie"
}`,
      },
      {
        role: "user",
        content: `CEL: ${goal.name}
Kategoria: ${goal.category}
Opis: ${goal.description || "brak"}
Wartość docelowa: ${goal.target_value || "?"} ${goal.target_unit || ""}
Termin: ${goal.target_date || "brak"}
Kierunek: ${goal.direction}

KONTEKST UŻYTKOWNIKA: ${userContext.summary}
HISTORIA CELU: ${goalHistory.summary}${previousContext}${signalsContext}${knowledgeContext}${capabilitiesContext}${capabilityGaps ? `\n\nBRAKUJĄCE ZDOLNOŚCI:\n${capabilityGaps}\nUWAGA: Jeśli brakuje źródła danych lub trackera — DODAJ krok "build_app" lub "run_skill" na początku strategii, aby najpierw zbudować potrzebne narzędzie.` : ""}

Wygeneruj plan realizacji tego celu.`,
      },
    ],
    {
      taskCategory: "analysis", // Tier 1-2 — balanced
      maxTokens: 2000,
      temperature: 0.3,
    },
  );

  try {
    // Strip markdown if present
    let content = response.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(content);

    return {
      approach: parsed.approach || "Plan automatyczny",
      steps: (parsed.steps || []).map(
        (s: Record<string, unknown>, i: number) => ({
          order: s.order || i + 1,
          title: s.title || `Krok ${i + 1}`,
          type: s.type || "create_task",
          params: (s.params as Record<string, unknown>) || {},
          status: "pending" as const,
          dueDate: s.dueDate as string | undefined,
        }),
      ),
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.7)),
      reasoning: parsed.reasoning || "",
      estimatedDuration: parsed.estimatedDuration || "nieznany",
    };
  } catch (error) {
    logger.error("[StrategyEngine] AI response parse failed:", {
      error: error instanceof Error ? error.message : error,
      content: response.content.slice(0, 500),
    });

    // Fallback: create a simple research + task strategy
    return {
      approach: `Automatyczny plan dla "${goal.name}"`,
      steps: [
        {
          order: 1,
          title: `Zbadaj najlepsze metody: ${goal.name}`,
          type: "research" as const,
          params: {
            topic: goal.name,
            context: goal.description || goal.category,
          },
          status: "pending" as const,
        },
        {
          order: 2,
          title: `Rozpocznij realizację: ${goal.name}`,
          type: "create_task" as const,
          params: {
            title: `Realizacja: ${goal.name}`,
            description: `Cel: ${goal.target_value} ${goal.target_unit || ""}`,
            priority: "high",
          },
          status: "pending" as const,
        },
      ],
      confidence: 0.5,
      reasoning:
        "Plan wygenerowany automatycznie — AI nie zwróciła strukturyzowanej odpowiedzi",
      estimatedDuration: "do ustalenia",
    };
  }
}

// ============================================================================
// RESEARCH
// ============================================================================

async function conductResearch(
  tenantId: string,
  topic: string,
  context: string,
): Promise<string> {
  const response = await aiChat(
    [
      {
        role: "system",
        content: `Jesteś badaczem w systemie ExoSkull. Twoje zadanie: znaleźć najlepsze, praktyczne metody osiągnięcia celu użytkownika.

Zwróć KONKRETNE, WYKONALNE zalecenia (nie ogólniki). Format:
1. [Metoda/Narzędzie] - co dokładnie zrobić
2. [Metoda/Narzędzie] - co dokładnie zrobić
...

Maks 5 zaleceń. Skup się na tym co da najszybszy efekt.`,
      },
      {
        role: "user",
        content: `Temat: ${topic}\nKontekst: ${context}`,
      },
    ],
    {
      taskCategory: "analysis",
      maxTokens: 1000,
    },
  );

  // Store research results as knowledge
  const supabase = getServiceSupabase();
  await supabase
    .from("exo_knowledge_chunks")
    .insert({
      tenant_id: tenantId,
      content: response.content,
      source: "strategy-research",
      tags: [topic.split(" ")[0]?.toLowerCase()].filter(Boolean),
    })
    .then(({ error }) => {
      if (error)
        logger.warn("[StrategyEngine] Knowledge insert failed:", error.message);
    });

  return response.content;
}
