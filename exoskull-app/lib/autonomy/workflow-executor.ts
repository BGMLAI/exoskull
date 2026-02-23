/**
 * Multi-Step Workflow Executor
 *
 * Enables multi-step autonomous workflows that chain actions together.
 * Each step can depend on previous steps, pass context forward, and handle failures.
 *
 * Example: "Book doctor appointment"
 *   1. Research doctors in area → context.doctors = [...]
 *   2. Check availability → context.available_slot = "..."
 *   3. Book appointment → context.booking_id = "..."
 *   4. Add to calendar
 *   5. Set reminder
 */

import { createClient } from "@supabase/supabase-js";
import { getActionExecutor } from "./action-executor";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowStep {
  id: string;
  action: string; // Action type: research, send_email, create_task, make_call, etc.
  title: string;
  params: Record<string, unknown>;
  dependsOn?: string[]; // Step IDs that must complete first
  condition?: string; // JS expression evaluated against context, e.g. "context.doctor_found === true"
  onFailure: "retry" | "skip" | "abort" | "ask_user";
  maxRetries?: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  retryCount?: number;
}

export interface AutonomousWorkflow {
  id: string;
  tenantId: string;
  goalId?: string;
  title: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed" | "paused";
  context: Record<string, unknown>; // Shared context passed between steps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkflowResult {
  workflowId: string;
  status: AutonomousWorkflow["status"];
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  context: Record<string, unknown>;
}

// ============================================================================
// WORKFLOW EXECUTOR
// ============================================================================

/**
 * Create and persist a new workflow.
 */
export async function createWorkflow(
  tenantId: string,
  title: string,
  steps: Omit<WorkflowStep, "status" | "retryCount">[],
  goalId?: string,
): Promise<AutonomousWorkflow> {
  const supabase = getServiceSupabase();
  const id = crypto.randomUUID();

  const workflow: AutonomousWorkflow = {
    id,
    tenantId,
    goalId,
    title,
    steps: steps.map((s) => ({
      ...s,
      status: "pending" as const,
      retryCount: 0,
    })),
    currentStepIndex: 0,
    status: "pending",
    context: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await supabase.from("exo_workflows").insert({
    id,
    tenant_id: tenantId,
    goal_id: goalId || null,
    title,
    steps: workflow.steps,
    current_step_index: 0,
    status: "pending",
    context: {},
  });

  return workflow;
}

/**
 * Execute the next eligible step(s) in a workflow.
 * Returns the workflow result after execution.
 */
export async function executeWorkflow(
  workflowId: string,
): Promise<WorkflowResult> {
  const supabase = getServiceSupabase();

  // Load workflow
  const { data: row } = await supabase
    .from("exo_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!row) throw new Error(`Workflow not found: ${workflowId}`);

  const workflow: AutonomousWorkflow = {
    id: row.id,
    tenantId: row.tenant_id,
    goalId: row.goal_id,
    title: row.title,
    steps: row.steps as WorkflowStep[],
    currentStepIndex: row.current_step_index,
    status: row.status,
    context: (row.context as Record<string, unknown>) || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (workflow.status === "completed" || workflow.status === "failed") {
    return buildResult(workflow);
  }

  // Mark as running
  workflow.status = "running";
  await updateWorkflow(supabase, workflow);

  const executor = getActionExecutor();
  let stepsExecutedThisCycle = 0;
  const MAX_STEPS_PER_CYCLE = 5; // Safety limit

  // Execute steps in order, respecting dependencies
  for (let i = 0; i < workflow.steps.length; i++) {
    if (stepsExecutedThisCycle >= MAX_STEPS_PER_CYCLE) break;

    const step = workflow.steps[i];
    if (step.status !== "pending") continue;

    // Check dependencies
    if (step.dependsOn && step.dependsOn.length > 0) {
      const depsMet = step.dependsOn.every((depId) => {
        const depStep = workflow.steps.find((s) => s.id === depId);
        return depStep && (depStep.status === "completed" || depStep.status === "skipped");
      });
      if (!depsMet) continue; // Skip this step until deps are met
    }

    // Evaluate condition
    if (step.condition) {
      try {
        const conditionFn = new Function("context", `return ${step.condition}`);
        if (!conditionFn(workflow.context)) {
          step.status = "skipped";
          continue;
        }
      } catch {
        // If condition evaluation fails, skip the step
        step.status = "skipped";
        continue;
      }
    }

    // Execute step
    step.status = "running";
    workflow.currentStepIndex = i;
    await updateWorkflow(supabase, workflow);

    try {
      const result = await executeWorkflowStep(
        workflow.tenantId,
        step,
        workflow.context,
        executor,
      );

      step.status = "completed";
      step.result = result;

      // Merge result into workflow context
      if (result && typeof result === "object") {
        Object.assign(workflow.context, result);
      }

      stepsExecutedThisCycle++;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      step.error = errMsg;
      step.retryCount = (step.retryCount || 0) + 1;

      const maxRetries = step.maxRetries || 2;

      switch (step.onFailure) {
        case "retry":
          if (step.retryCount < maxRetries) {
            step.status = "pending"; // Will retry next cycle
          } else {
            step.status = "failed";
          }
          break;
        case "skip":
          step.status = "skipped";
          break;
        case "abort":
          step.status = "failed";
          workflow.status = "failed";
          await updateWorkflow(supabase, workflow);
          await sendProactiveMessage(
            workflow.tenantId,
            `Workflow "${workflow.title}" nie powiódł się na kroku: "${step.title}"\nBłąd: ${errMsg}`,
            "workflow_failed",
            "workflow-executor",
          );
          return buildResult(workflow);
        case "ask_user":
          step.status = "pending";
          workflow.status = "waiting_approval";
          await updateWorkflow(supabase, workflow);
          await sendProactiveMessage(
            workflow.tenantId,
            `Workflow "${workflow.title}" potrzebuje Twojej pomocy na kroku: "${step.title}"\nBłąd: ${errMsg}\n\nCo zrobić? Mogę spróbować ponownie, pominąć lub przerwać.`,
            "workflow_needs_input",
            "workflow-executor",
          );
          return buildResult(workflow);
      }
    }
  }

  // Check if all steps are done
  const allDone = workflow.steps.every(
    (s) => s.status === "completed" || s.status === "skipped" || s.status === "failed",
  );

  if (allDone) {
    workflow.status = "completed";
    workflow.completedAt = new Date().toISOString();

    const completed = workflow.steps.filter((s) => s.status === "completed").length;
    const total = workflow.steps.length;

    await sendProactiveMessage(
      workflow.tenantId,
      `Workflow "${workflow.title}" zakończony! ${completed}/${total} kroków wykonanych.`,
      "workflow_completed",
      "workflow-executor",
    );
  }

  await updateWorkflow(supabase, workflow);
  return buildResult(workflow);
}

// ============================================================================
// STEP EXECUTOR
// ============================================================================

async function executeWorkflowStep(
  tenantId: string,
  step: WorkflowStep,
  context: Record<string, unknown>,
  executor: ReturnType<typeof getActionExecutor>,
): Promise<Record<string, unknown>> {
  // Resolve template params (replace {{context.xxx}} with actual values)
  const resolvedParams = resolveParams(step.params, context);

  switch (step.action) {
    case "research": {
      const { aiChat } = await import("@/lib/ai");
      const response = await aiChat(
        [
          {
            role: "system",
            content: "Jesteś badaczem. Znajdź konkretne, praktyczne informacje. Zwróć wyniki jako JSON z kluczowymi znaleziskami.",
          },
          {
            role: "user",
            content: `Temat: ${resolvedParams.topic}\nKontekst: ${resolvedParams.context || ""}`,
          },
        ],
        { taskCategory: "analysis", maxTokens: 1000 },
      );
      return { research_result: response.content };
    }

    case "create_task": {
      const result = await executor.execute({
        type: "create_task",
        tenantId,
        params: resolvedParams,
        skipPermissionCheck: true,
      });
      return { task_created: result.success, task_data: result.data };
    }

    case "send_message": {
      await sendProactiveMessage(
        tenantId,
        resolvedParams.message as string,
        "workflow_step",
        "workflow-executor",
      );
      return { message_sent: true };
    }

    case "send_email": {
      const result = await executor.execute({
        type: "send_email",
        tenantId,
        params: resolvedParams,
        skipPermissionCheck: true,
      });
      return { email_sent: result.success };
    }

    case "create_event": {
      const result = await executor.execute({
        type: "create_event",
        tenantId,
        params: resolvedParams,
        skipPermissionCheck: true,
      });
      return { event_created: result.success };
    }

    case "wait": {
      // No-op — just passes context through
      return {};
    }

    default: {
      // Generic action executor fallback
      const result = await executor.execute({
        type: step.action as any,
        tenantId,
        params: resolvedParams,
        skipPermissionCheck: true,
      });
      return { action_result: result.data, success: result.success };
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve template variables in params.
 * Replaces {{context.xxx}} with actual context values.
 */
function resolveParams(
  params: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      resolved[key] = value.replace(/\{\{context\.(\w+)\}\}/g, (_match, varName) => {
        const val = context[varName];
        return val !== undefined ? String(val) : "";
      });
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

async function updateWorkflow(
  supabase: ReturnType<typeof getServiceSupabase>,
  workflow: AutonomousWorkflow,
): Promise<void> {
  await supabase
    .from("exo_workflows")
    .update({
      steps: workflow.steps,
      current_step_index: workflow.currentStepIndex,
      status: workflow.status,
      context: workflow.context,
      completed_at: workflow.completedAt || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflow.id);
}

function buildResult(workflow: AutonomousWorkflow): WorkflowResult {
  return {
    workflowId: workflow.id,
    status: workflow.status,
    stepsCompleted: workflow.steps.filter((s) => s.status === "completed").length,
    stepsFailed: workflow.steps.filter((s) => s.status === "failed").length,
    stepsSkipped: workflow.steps.filter((s) => s.status === "skipped").length,
    context: workflow.context,
  };
}

/**
 * Resume a paused/waiting workflow.
 */
export async function resumeWorkflow(
  workflowId: string,
  action: "retry" | "skip" | "abort",
): Promise<WorkflowResult> {
  const supabase = getServiceSupabase();

  const { data: row } = await supabase
    .from("exo_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!row) throw new Error(`Workflow not found: ${workflowId}`);

  if (action === "abort") {
    await supabase
      .from("exo_workflows")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", workflowId);
    return {
      workflowId,
      status: "failed",
      stepsCompleted: 0,
      stepsFailed: 0,
      stepsSkipped: 0,
      context: {},
    };
  }

  const steps = row.steps as WorkflowStep[];
  const currentStep = steps[row.current_step_index];

  if (currentStep) {
    if (action === "skip") {
      currentStep.status = "skipped";
    } else {
      currentStep.status = "pending";
      currentStep.retryCount = 0;
    }
  }

  await supabase
    .from("exo_workflows")
    .update({
      steps,
      status: "running",
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId);

  return executeWorkflow(workflowId);
}

/**
 * Get active workflows for a tenant.
 */
export async function getActiveWorkflows(
  tenantId: string,
): Promise<AutonomousWorkflow[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_workflows")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "running", "waiting_approval", "paused"])
    .order("created_at", { ascending: false })
    .limit(20);

  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    goalId: row.goal_id,
    title: row.title,
    steps: row.steps as WorkflowStep[],
    currentStepIndex: row.current_step_index,
    status: row.status,
    context: (row.context as Record<string, unknown>) || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));
}
