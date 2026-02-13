/**
 * Meta-Coordinator
 *
 * Orchestrates all agents in the ExoSkull system:
 * - Decides which agents to spawn based on context
 * - Coordinates multi-agent workflows
 * - Manages resources and priorities
 *
 * Framework: Resources -> Environment -> Decision
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IAgent,
  AgentContext,
  AgentTier,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  SpawnRequest,
  AGENT_TIERS,
} from "./types";
import { getAgentRegistry, runAgentTask } from "./registry";
import { createAgentContext, canSpawnChild } from "./core/agent-context";

// Import specialized agents for registration
import { MITDetectorAgent } from "./specialized/mit-detector";
import { ClarifyingAgent } from "./specialized/clarifying-agent";
import { HighlightExtractorAgent } from "./specialized/highlight-extractor";
import { PatternLearnerAgent } from "./specialized/pattern-learner";

import { logger } from "@/lib/logger";
import {
  getTasks,
  getTaskStats,
  getOverdueTasks,
} from "@/lib/tasks/task-service";
import type { Task } from "@/lib/tasks/task-service";
// ============================================================================
// COORDINATOR CLASS
// ============================================================================

export class MetaCoordinator {
  private supabase: SupabaseClient;
  private initialized = false;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize coordinator and register all agents
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const registry = getAgentRegistry();

    // Register all specialized agents
    registry.register({
      id: "mit-detector",
      name: "MIT Detector",
      tier: AGENT_TIERS.DEEP,
      capabilities: ["mit_detection", "goal_analysis", "priority_ranking"],
      factory: (ctx) => new MITDetectorAgent(ctx),
      maxInstances: 1,
      cooldownMs: 60 * 60 * 1000, // 1 hour
      description: "Detects Most Important Things (top 3 objectives)",
    });

    registry.register({
      id: "clarifying-agent",
      name: "Clarifying Agent",
      tier: AGENT_TIERS.BALANCED,
      capabilities: [
        "clarification",
        "essence_extraction",
        "emotion_separation",
      ],
      factory: (ctx) => new ClarifyingAgent(ctx),
      maxInstances: 5,
      cooldownMs: 1000, // 1 second
      description: "Extracts essence from emotional/confused input",
    });

    registry.register({
      id: "highlight-extractor",
      name: "Highlight Extractor",
      tier: AGENT_TIERS.BALANCED,
      capabilities: [
        "highlight_extraction",
        "preference_detection",
        "pattern_detection",
      ],
      factory: (ctx) => new HighlightExtractorAgent(ctx),
      maxInstances: 2,
      cooldownMs: 5 * 60 * 1000, // 5 minutes
      description: "Extracts highlights from conversations",
    });

    registry.register({
      id: "pattern-learner",
      name: "Pattern Learner",
      tier: AGENT_TIERS.DEEP,
      capabilities: [
        "pattern_detection",
        "behavior_analysis",
        "automation_suggestion",
      ],
      factory: (ctx) => new PatternLearnerAgent(ctx),
      maxInstances: 1,
      cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
      description: "Detects behavioral patterns and suggests automations",
    });

    this.initialized = true;
    logger.info("[MetaCoordinator] Initialized with 4 specialized agents");
  }

  // ============================================================================
  // COORDINATION
  // ============================================================================

  /**
   * Coordinate agents for a tenant based on current context
   */
  async coordinate(
    tenantId: string,
    trigger: "cron" | "event" | "manual",
    event?: string,
  ): Promise<{
    agentsRun: string[];
    results: Record<string, unknown>;
    errors: string[];
  }> {
    await this.initialize();

    const agentsRun: string[] = [];
    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    logger.info(
      `[MetaCoordinator] Coordinating for ${tenantId}, trigger: ${trigger}`,
    );

    try {
      // 1. Analyze context
      const context = createAgentContext(tenantId);
      const resources = await this.analyzeResources(tenantId);
      const environment = await this.analyzeEnvironment(tenantId);

      // 2. Decide which agents to run
      const agentDecisions = this.decideAgents(
        resources,
        environment,
        trigger,
        event,
      );

      // 3. Execute agents
      for (const decision of agentDecisions) {
        logger.info(
          `[MetaCoordinator] Running ${decision.agentId} (priority: ${decision.priority})`,
        );

        const result = await runAgentTask(decision.task, tenantId, {
          priority: decision.priority,
          preferredTier: decision.tier,
        });

        agentsRun.push(decision.agentId);

        if (result.success) {
          results[decision.agentId] = result.result;
        } else {
          errors.push(`${decision.agentId}: ${result.error}`);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { agentsRun, results, errors };
  }

  /**
   * Run a specific agent task
   */
  async runAgent(
    tenantId: string,
    agentId: string,
    params?: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
  }> {
    await this.initialize();

    const registry = getAgentRegistry();
    const registration = registry.findByCapability(agentId)[0];

    if (!registration) {
      return { success: false, error: `Agent not found: ${agentId}` };
    }

    const context = createAgentContext(tenantId, { metadata: params });
    const agent = registration.factory(context);

    try {
      if (agent.onSpawn) await agent.onSpawn();

      const resources = await agent.analyzeResources(tenantId);
      const environment = await agent.analyzeEnvironment(tenantId);
      const decisions = await agent.decide(resources, environment, context);

      if (decisions.length === 0) {
        return { success: true, result: { action: "no_action_needed" } };
      }

      // Add any custom params to decision
      const decision: Decision = {
        ...decisions[0],
        params: { ...decisions[0].params, ...params },
      };

      const result = await agent.execute(decision);

      return {
        success: result.success,
        result: result.data,
        error: result.error,
      };
    } finally {
      if (agent.onRelease) await agent.onRelease();
    }
  }

  // ============================================================================
  // DECISION LOGIC
  // ============================================================================

  private decideAgents(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    trigger: "cron" | "event" | "manual",
    event?: string,
  ): Array<{
    agentId: string;
    task: string;
    priority: SpawnRequest["priority"];
    tier?: AgentTier;
  }> {
    const decisions: Array<{
      agentId: string;
      task: string;
      priority: SpawnRequest["priority"];
      tier?: AgentTier;
    }> = [];

    // Don't run during quiet hours unless critical
    if (environment.isQuietHours && trigger !== "manual") {
      logger.info(
        "[MetaCoordinator] Quiet hours - skipping non-critical agents",
      );
      return [];
    }

    // CRON trigger - run periodic tasks
    if (trigger === "cron") {
      // Highlight extraction (every 15 min)
      decisions.push({
        agentId: "highlight-extractor",
        task: "highlight_extraction",
        priority: "normal",
        tier: AGENT_TIERS.BALANCED,
      });

      // MIT detection (weekly, Monday morning)
      if (environment.dayOfWeek === 1 && environment.timeOfDay === "morning") {
        decisions.push({
          agentId: "mit-detector",
          task: "mit_detection",
          priority: "low",
          tier: AGENT_TIERS.DEEP,
        });
      }

      // Pattern learning (weekly, Sunday)
      if (environment.dayOfWeek === 0) {
        decisions.push({
          agentId: "pattern-learner",
          task: "pattern_detection",
          priority: "low",
          tier: AGENT_TIERS.DEEP,
        });
      }
    }

    // Event trigger
    if (trigger === "event" && event) {
      switch (event) {
        case "conversation_ended":
          // Quick highlight extraction
          decisions.push({
            agentId: "highlight-extractor",
            task: "highlight_extraction",
            priority: "normal",
          });
          break;

        case "decision_needed":
          // Clarify the situation
          decisions.push({
            agentId: "clarifying-agent",
            task: "clarification",
            priority: "high",
          });
          break;

        case "goal_mentioned":
          // Update MITs
          decisions.push({
            agentId: "mit-detector",
            task: "mit_detection",
            priority: "normal",
          });
          break;
      }
    }

    return decisions;
  }

  // ============================================================================
  // CONTEXT ANALYSIS
  // ============================================================================

  private async analyzeResources(tenantId: string): Promise<ResourceAnalysis> {
    const [conversations, highlights, taskStats, mits] = await Promise.all([
      this.count("exo_conversations", tenantId),
      this.count("user_memory_highlights", tenantId, "user_id"),
      getTaskStats(tenantId, this.supabase),
      this.count("user_mits", tenantId),
    ]);
    const tasks = taskStats.total;

    const { data: rigs } = await this.supabase
      .from("rig_connections")
      .select("rig_slug")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    return {
      availableData: {
        conversations,
        highlights,
        tasks,
        patterns: 0,
        mits,
      },
      connectedRigs: rigs?.map((r) => r.rig_slug) || [],
      activeModules: [],
      modelAvailability: {
        "gemini-flash": true,
        "claude-haiku": true,
        "kimi-k2": true,
        "claude-opus": true,
      },
      quotas: {
        aiCallsRemaining: 1000,
        storageUsedMb: 0,
        apiCallsToday: 0,
      },
    };
  }

  private async analyzeEnvironment(
    tenantId: string,
  ): Promise<EnvironmentAnalysis> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    const { data: lastConv } = await this.supabase
      .from("exo_conversations")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const [pendingTasks, overdueTasks] = await Promise.all([
      getTasks(tenantId, { status: "pending" }, this.supabase),
      getOverdueTasks(tenantId, undefined, this.supabase),
    ]);

    const pending = pendingTasks.length;
    // priority >= 7 = high/urgent in Tyrolka scale (1-10)
    const urgent = pendingTasks.filter((t: Task) => t.priority >= 7).length;
    const overdue = overdueTasks.length;

    return {
      timeOfDay: this.getTimeOfDay(hour),
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isQuietHours: hour >= 22 || hour < 7,
      userMood: "unknown",
      lastConversationAgo: lastConv
        ? Math.floor(
            (now.getTime() - new Date(lastConv.created_at).getTime()) / 60000,
          )
        : -1,
      recentActivityLevel: "medium",
      pendingTasks: pending,
      urgentItems: urgent,
      overdueTasks: overdue,
      calendarBusy: false,
      upcomingEvents: 0,
      lastHighlightExtraction: null,
      lastMitDetection: null,
    };
  }

  private async count(
    table: string,
    tenantId: string,
    tenantColumn = "tenant_id",
  ): Promise<number> {
    const { count } = await this.supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(tenantColumn, tenantId);
    return count || 0;
  }

  private getTimeOfDay(
    hour: number,
  ): "early_morning" | "morning" | "afternoon" | "evening" | "night" {
    if (hour >= 5 && hour < 9) return "early_morning";
    if (hour >= 9 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let coordinatorInstance: MetaCoordinator | null = null;

export function getMetaCoordinator(): MetaCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MetaCoordinator();
  }
  return coordinatorInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Run coordination cycle (called by CRON)
 */
export async function runCoordinationCycle(tenantId: string): Promise<{
  agentsRun: string[];
  results: Record<string, unknown>;
  errors: string[];
}> {
  const coordinator = getMetaCoordinator();
  return coordinator.coordinate(tenantId, "cron");
}

/**
 * Handle an event that might trigger agents
 */
export async function handleEvent(
  tenantId: string,
  event: string,
): Promise<{
  agentsRun: string[];
  results: Record<string, unknown>;
  errors: string[];
}> {
  const coordinator = getMetaCoordinator();
  return coordinator.coordinate(tenantId, "event", event);
}

/**
 * Clarify a user input
 */
export async function clarify(
  tenantId: string,
  input: string,
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  const coordinator = getMetaCoordinator();
  return coordinator.runAgent(tenantId, "clarifying-agent", { input });
}

/**
 * Get user's MITs
 */
export async function detectMITs(tenantId: string): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  const coordinator = getMetaCoordinator();
  return coordinator.runAgent(tenantId, "mit-detector");
}
