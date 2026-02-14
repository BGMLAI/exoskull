/**
 * Agent Swarm Coordinator
 *
 * Manages a team of specialized AI agents that work together in Ralph Loop.
 * Each agent has a role, a model, and runs in a loop until its task is done.
 *
 * Agents:
 * - Coordinator (Opus) — assigns tasks, evaluates progress, makes strategic decisions
 * - Builder (Sonnet) — writes code, creates files, implements features
 * - Tester (Haiku) — tests, validates, checks health
 * - Lateral (Kimi) — creative thinking, controlled errors, cross-domain analogies
 * - Observer — monitors progress, logs insights, detects patterns
 *
 * Communication: Event-driven via inter-system bus
 * GOTCHA: Each cycle follows Goals→Orchestration→Tools→Context→HardPrompts→Args
 * ATLAS: App building follows Architect→Trace→Link→Assemble→Stress-test
 */

import { aiChat } from "@/lib/ai";
import { emitSystemEvent } from "@/lib/system/events";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPES
// ============================================================================

export type AgentRole =
  | "coordinator"
  | "builder"
  | "tester"
  | "lateral"
  | "observer";

export interface SwarmAgent {
  id: string;
  role: AgentRole;
  model: string;
  status: "idle" | "working" | "done" | "error" | "stuck";
  currentTask?: string;
  iterations: number;
  maxIterations: number;
  results: string[];
  startedAt?: number;
  lastActivityAt?: number;
}

export interface SwarmTask {
  id: string;
  description: string;
  type:
    | "build_app"
    | "fix_bug"
    | "optimize"
    | "heal_integration"
    | "generate_content"
    | "research"
    | "lateral_experiment";
  priority: number;
  assignedTo?: AgentRole;
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
  result?: string;
  subtasks?: SwarmTask[];
  context?: Record<string, unknown>;
  createdAt: number;
}

export interface SwarmSession {
  id: string;
  tenantId: string;
  tasks: SwarmTask[];
  agents: SwarmAgent[];
  status: "planning" | "executing" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  totalCost: number;
  insights: string[];
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

const AGENT_CONFIGS: Record<
  AgentRole,
  { model: string; maxIterations: number; systemPrompt: string }
> = {
  coordinator: {
    model: "claude-opus-4-6",
    maxIterations: 10,
    systemPrompt: `You are the Coordinator of an AI agent swarm. Your role:
- Analyze tasks and break them into subtasks
- Assign subtasks to appropriate agents (Builder, Tester, Lateral)
- Evaluate progress and adjust plans
- Make strategic decisions when agents are stuck
- Ensure GOTCHA framework is followed (Goals→Orchestration→Tools→Context→HardPrompts→Args)
- Ensure ATLAS is followed for app building (Architect→Trace→Link→Assemble→Stress-test)

Respond with JSON: { "action": "assign|evaluate|adjust|complete", "assignments": [...], "evaluation": "...", "nextSteps": [...] }`,
  },
  builder: {
    model: "claude-sonnet-4-5",
    maxIterations: 20,
    systemPrompt: `You are the Builder agent. Your role:
- Write production-quality code
- Create files, modify existing ones
- Follow existing codebase patterns
- Implement features end-to-end (DB schema → API → UI)
- Never leave TODO comments — implement everything

Respond with JSON: { "action": "code|modify|create", "files": [...], "summary": "..." }`,
  },
  tester: {
    model: "claude-3-5-haiku",
    maxIterations: 15,
    systemPrompt: `You are the Tester agent. Your role:
- Validate code correctness
- Check for edge cases, error handling
- Verify API responses
- Run health checks on integrations
- Report bugs with specific file:line references

Respond with JSON: { "action": "test|verify|report", "results": [...], "bugs": [...], "passed": boolean }`,
  },
  lateral: {
    model: "kimi-k2.5",
    maxIterations: 5,
    systemPrompt: `You are the Lateral Thinker agent. Your role:
- Generate unconventional solutions when other agents are stuck
- Use techniques: random association, reverse problem, cross-domain analogy, provocative operation
- Make CONTROLLED errors to discover new approaches
- Challenge assumptions
- Propose wild ideas that might unlock progress

Respond with JSON: { "action": "provoke|associate|reverse|analogize", "idea": "...", "rationale": "..." }`,
  },
  observer: {
    model: "claude-3-5-haiku",
    maxIterations: 50,
    systemPrompt: `You are the Observer agent. Your role:
- Monitor all agent activities
- Detect patterns (successes, failures, bottlenecks)
- Log insights for future reference
- Alert when an agent appears stuck (3+ iterations without progress)
- Generate progress reports

Respond with JSON: { "action": "observe|alert|report", "patterns": [...], "alerts": [...], "progress": "..." }`,
  },
};

// ============================================================================
// SWARM MANAGEMENT
// ============================================================================

const activeSessions = new Map<string, SwarmSession>();

/**
 * Initialize a new swarm session for a set of tasks
 */
export function createSwarmSession(
  tenantId: string,
  tasks: Omit<SwarmTask, "id" | "createdAt" | "status">[],
): SwarmSession {
  const sessionId = `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const swarmTasks: SwarmTask[] = tasks.map((t, i) => ({
    ...t,
    id: `task_${i}_${Date.now()}`,
    status: "pending",
    createdAt: Date.now(),
  }));

  const agents: SwarmAgent[] = (Object.keys(AGENT_CONFIGS) as AgentRole[]).map(
    (role) => ({
      id: `${role}_${sessionId}`,
      role,
      model: AGENT_CONFIGS[role].model,
      status: "idle",
      iterations: 0,
      maxIterations: AGENT_CONFIGS[role].maxIterations,
      results: [],
    }),
  );

  const session: SwarmSession = {
    id: sessionId,
    tenantId,
    tasks: swarmTasks,
    agents,
    status: "planning",
    startedAt: Date.now(),
    totalCost: 0,
    insights: [],
  };

  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Run one cycle of the swarm (called from Ralph Loop)
 * Returns true if all tasks are done, false if more cycles needed
 */
export async function runSwarmCycle(sessionId: string): Promise<{
  done: boolean;
  progress: string;
  actions: string[];
}> {
  const session = activeSessions.get(sessionId);
  if (!session)
    return { done: true, progress: "Session not found", actions: [] };

  const actions: string[] = [];

  try {
    // Phase 1: Coordinator plans/evaluates
    const coordinator = session.agents.find((a) => a.role === "coordinator")!;
    const pendingTasks = session.tasks.filter(
      (t) => t.status === "pending" || t.status === "in_progress",
    );

    if (pendingTasks.length === 0) {
      session.status = "completed";
      session.completedAt = Date.now();
      return { done: true, progress: "All tasks completed!", actions };
    }

    // Coordinator assigns work
    coordinator.status = "working";
    coordinator.iterations++;
    coordinator.lastActivityAt = Date.now();

    const coordPrompt = `Current tasks:\n${pendingTasks.map((t) => `- [${t.status}] ${t.description} (type: ${t.type}, priority: ${t.priority})`).join("\n")}\n\nAgent states:\n${session.agents
      .filter((a) => a.role !== "coordinator")
      .map(
        (a) =>
          `- ${a.role}: ${a.status}, iterations: ${a.iterations}/${a.maxIterations}`,
      )
      .join(
        "\n",
      )}\n\nRecent insights: ${session.insights.slice(-3).join("; ") || "none"}\n\nDecide: Which tasks to assign to which agents? What's the strategy?`;

    const coordResult = await aiChat(
      [
        { role: "system", content: AGENT_CONFIGS.coordinator.systemPrompt },
        { role: "user", content: coordPrompt },
      ],
      { forceModel: "claude-opus-4-6", maxTokens: 2000 },
    );

    coordinator.status = "idle";
    coordinator.results.push(
      coordResult.content?.slice(0, 500) || "no response",
    );
    actions.push(
      `Coordinator: ${coordResult.content?.slice(0, 200) || "planned"}`,
    );

    // Phase 2: Execute assigned tasks in parallel
    const workerAgents = session.agents.filter(
      (a) =>
        a.role !== "coordinator" &&
        a.role !== "observer" &&
        a.status !== "done" &&
        a.iterations < a.maxIterations,
    );

    const workerPromises = workerAgents.slice(0, 3).map(async (agent) => {
      const task = pendingTasks.find(
        (t) => !t.assignedTo || t.assignedTo === agent.role,
      );
      if (!task) return;

      agent.status = "working";
      agent.currentTask = task.description;
      agent.iterations++;
      agent.lastActivityAt = Date.now();
      task.status = "in_progress";
      task.assignedTo = agent.role;

      try {
        const result = await aiChat(
          [
            { role: "system", content: AGENT_CONFIGS[agent.role].systemPrompt },
            {
              role: "user",
              content: `Task: ${task.description}\nType: ${task.type}\nContext: ${JSON.stringify(task.context || {})}\n\nCoordinator says: ${coordResult.content?.slice(0, 500) || "proceed"}\n\nExecute this task.`,
            },
          ],
          {
            forceModel: agent.model as "claude-sonnet-4-5" | "claude-3-5-haiku",
            maxTokens: 4000,
          },
        );

        agent.results.push(result.content?.slice(0, 500) || "");
        actions.push(
          `${agent.role}: ${result.content?.slice(0, 200) || "completed"}`,
        );

        // Check if task is done (simple heuristic)
        if (
          result.content?.toLowerCase().includes('"passed": true') ||
          result.content?.toLowerCase().includes("complete")
        ) {
          task.status = "completed";
          task.result = result.content?.slice(0, 1000);
          agent.status = "idle";
        } else {
          agent.status = "idle";
        }
      } catch (err) {
        agent.status = "error";
        task.status = "failed";
        actions.push(
          `${agent.role}: ERROR - ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    await Promise.allSettled(workerPromises);

    // Phase 3: Observer monitors
    const observer = session.agents.find((a) => a.role === "observer")!;
    observer.iterations++;

    // Check for stuck agents
    const stuckAgents = session.agents.filter(
      (a) =>
        a.iterations > 3 &&
        a.status === "idle" &&
        a.results.length < a.iterations / 2,
    );

    if (stuckAgents.length > 0) {
      // Trigger lateral thinking
      const lateral = session.agents.find((a) => a.role === "lateral")!;
      if (lateral.iterations < lateral.maxIterations) {
        lateral.status = "working";
        lateral.iterations++;

        const lateralResult = await aiChat(
          [
            { role: "system", content: AGENT_CONFIGS.lateral.systemPrompt },
            {
              role: "user",
              content: `The team is stuck on: ${stuckAgents.map((a) => a.currentTask || "unknown").join(", ")}\n\nRecent attempts:\n${stuckAgents.map((a) => a.results.slice(-2).join("\n")).join("\n---\n")}\n\nGenerate an unconventional approach.`,
            },
          ],
          { maxTokens: 2000 },
        );

        lateral.status = "idle";
        session.insights.push(
          `Lateral: ${lateralResult.content?.slice(0, 300) || ""}`,
        );
        actions.push(
          `Lateral thinker activated: ${lateralResult.content?.slice(0, 200) || ""}`,
        );
      }
    }

    // Log progress
    const completedCount = session.tasks.filter(
      (t) => t.status === "completed",
    ).length;
    const totalCount = session.tasks.length;
    const progress = `${completedCount}/${totalCount} tasks complete`;

    emitSystemEvent({
      tenantId: session.tenantId,
      eventType: "ralph_cycle_completed",
      component: "agent_swarm",
      severity: "info",
      message: `Swarm cycle: ${progress}`,
      details: {
        sessionId,
        completedCount,
        totalCount,
        actions: actions.length,
      },
    });

    return {
      done: completedCount === totalCount,
      progress,
      actions,
    };
  } catch (err) {
    return {
      done: false,
      progress: `Swarm error: ${err instanceof Error ? err.message : err}`,
      actions,
    };
  }
}

/**
 * Get current swarm status
 */
export function getSwarmStatus(sessionId: string): SwarmSession | null {
  return activeSessions.get(sessionId) || null;
}

/**
 * List all active swarm sessions for a tenant
 */
export function getActiveSwarms(tenantId: string): SwarmSession[] {
  return Array.from(activeSessions.values()).filter(
    (s) =>
      s.tenantId === tenantId &&
      s.status !== "completed" &&
      s.status !== "failed",
  );
}

/**
 * Log swarm results to database for persistence
 */
export async function persistSwarmResults(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const supabase = getServiceSupabase();
  await supabase.from("exo_dev_journal").insert({
    tenant_id: session.tenantId,
    entry_type: "swarm_session",
    title: `Swarm: ${session.tasks.length} tasks`,
    content: JSON.stringify({
      tasks: session.tasks.map((t) => ({
        description: t.description,
        status: t.status,
        result: t.result?.slice(0, 500),
      })),
      agents: session.agents.map((a) => ({
        role: a.role,
        iterations: a.iterations,
        status: a.status,
      })),
      insights: session.insights,
      duration: (session.completedAt || Date.now()) - session.startedAt,
    }),
    metadata: {
      sessionId,
      completedTasks: session.tasks.filter((t) => t.status === "completed")
        .length,
      totalTasks: session.tasks.length,
      totalIterations: session.agents.reduce((s, a) => s + a.iterations, 0),
    },
  });

  // Clean up memory
  if (session.status === "completed" || session.status === "failed") {
    activeSessions.delete(sessionId);
  }
}
