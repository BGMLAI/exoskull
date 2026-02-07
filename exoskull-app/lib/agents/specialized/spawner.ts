/**
 * Agent Spawner
 *
 * Dynamically spawns agents based on detected needs.
 * Creates specialized agents on-demand when patterns or gaps require them.
 */

import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  AGENT_TIERS,
  SpawnRequest,
  AgentRegistration,
} from "../types";
import { BaseAgent } from "../core/base-agent";
import { getAgentRegistry } from "../registry";

import { logger } from "@/lib/logger";
// ============================================================================
// AGENT SPAWN TRIGGER
// ============================================================================

export interface SpawnTrigger {
  name: string;
  description: string;
  condition: (
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
  ) => boolean;
  agentConfig: Partial<AgentRegistration>;
  priority: SpawnRequest["priority"];
}

// ============================================================================
// DEFAULT SPAWN TRIGGERS
// ============================================================================

const DEFAULT_SPAWN_TRIGGERS: SpawnTrigger[] = [
  {
    name: "urgent_task_handler",
    description: "Spawn when there are many urgent tasks",
    condition: (_, env) => env.urgentItems > 5,
    agentConfig: {
      id: "urgent-task-handler",
      name: "Urgent Task Handler",
      tier: AGENT_TIERS.BALANCED,
      capabilities: ["task_prioritization", "urgent_handling"],
    },
    priority: "high",
  },
  {
    name: "overdue_cleaner",
    description: "Spawn to handle overdue tasks",
    condition: (_, env) => env.overdueTasks > 10,
    agentConfig: {
      id: "overdue-cleaner",
      name: "Overdue Task Cleaner",
      tier: AGENT_TIERS.BALANCED,
      capabilities: ["task_cleanup", "overdue_handling"],
    },
    priority: "normal",
  },
  {
    name: "engagement_booster",
    description: "Spawn when user activity is low",
    condition: (_, env) =>
      env.recentActivityLevel === "none" && env.lastConversationAgo > 72 * 60,
    agentConfig: {
      id: "engagement-booster",
      name: "Engagement Booster",
      tier: AGENT_TIERS.FLASH,
      capabilities: ["engagement", "check_in"],
    },
    priority: "low",
  },
  {
    name: "data_enricher",
    description: "Spawn when many highlights need processing",
    condition: (res) =>
      res.availableData.highlights < res.availableData.conversations * 0.1,
    agentConfig: {
      id: "data-enricher",
      name: "Data Enricher",
      tier: AGENT_TIERS.BALANCED,
      capabilities: ["highlight_extraction", "data_enrichment"],
    },
    priority: "normal",
  },
];

// ============================================================================
// SPAWNER AGENT
// ============================================================================

export class SpawnerAgent extends BaseAgent {
  readonly id = "spawner";
  readonly name = "Agent Spawner";
  readonly tier: AgentTier = AGENT_TIERS.FLASH;
  readonly capabilities = [
    "agent_spawning",
    "dynamic_agents",
    "need_detection",
  ];

  private triggers: SpawnTrigger[] = [...DEFAULT_SPAWN_TRIGGERS];

  constructor(context: AgentContext) {
    super(context);
  }

  /**
   * Add custom spawn trigger
   */
  addTrigger(trigger: SpawnTrigger): void {
    this.triggers.push(trigger);
  }

  /**
   * Remove spawn trigger
   */
  removeTrigger(name: string): void {
    this.triggers = this.triggers.filter((t) => t.name !== name);
  }

  // ============================================================================
  // DECIDE
  // ============================================================================

  async decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    _context?: AgentContext,
  ): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // Don't spawn during quiet hours
    if (environment.isQuietHours) {
      logger.info("[Spawner] Skipping - quiet hours");
      return [];
    }

    // Check each trigger
    const triggersToActivate: SpawnTrigger[] = [];
    for (const trigger of this.triggers) {
      try {
        if (trigger.condition(resources, environment)) {
          triggersToActivate.push(trigger);
        }
      } catch (error) {
        console.error(
          `[Spawner] Error evaluating trigger ${trigger.name}:`,
          error,
        );
      }
    }

    // Create decisions for triggered spawns
    for (const trigger of triggersToActivate) {
      decisions.push({
        action: "spawn_agent",
        confidence: 0.75,
        reasoning: trigger.description,
        params: {
          trigger: trigger.name,
          agentConfig: trigger.agentConfig,
          priority: trigger.priority,
        },
        urgency: trigger.priority === "critical" ? "immediate" : "soon",
        requiredTier: AGENT_TIERS.FLASH,
      });
    }

    // Also check for custom agent needs based on patterns
    const customSpawnDecision = await this.checkCustomAgentNeeds(
      this.context.tenantId,
      resources,
      environment,
    );
    if (customSpawnDecision) {
      decisions.push(customSpawnDecision);
    }

    return decisions;
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.status = "running";

    try {
      if (decision.action !== "spawn_agent") {
        return {
          success: false,
          action: decision.action,
          error: `Unknown action: ${decision.action}`,
          metrics: { durationMs: Date.now() - startTime },
        };
      }

      const { trigger, agentConfig, priority } = decision.params as {
        trigger: string;
        agentConfig: Partial<AgentRegistration>;
        priority: SpawnRequest["priority"];
      };

      // Check if agent already exists in registry
      const registry = getAgentRegistry();
      const existing = registry.findByCapability(
        agentConfig.capabilities?.[0] || "",
      );

      if (existing.length > 0) {
        // Use existing agent
        const agent = await registry.spawn({
          task: agentConfig.capabilities?.[0] || "default",
          tenantId: this.context.tenantId,
          priority,
        });

        if (agent) {
          this.status = "completed";
          return {
            success: true,
            action: "spawn_agent",
            data: {
              trigger,
              agentId: agent.id,
              agentName: agent.name,
              spawned: false,
              reused: true,
            },
            metrics: {
              durationMs: Date.now() - startTime,
              tier: this.tier,
            },
          };
        }
      }

      // Create and register new dynamic agent
      const dynamicAgent = this.createDynamicAgent(agentConfig);

      if (dynamicAgent) {
        // Spawn the agent
        const agent = await registry.spawn({
          task: dynamicAgent.capabilities[0],
          tenantId: this.context.tenantId,
          priority,
        });

        // Log the spawn
        await this.logSpawn(this.context.tenantId, trigger, dynamicAgent);

        this.status = "completed";

        const result: ExecutionResult = {
          success: true,
          action: "spawn_agent",
          data: {
            trigger,
            agentId: dynamicAgent.id,
            agentName: dynamicAgent.name,
            spawned: true,
            reused: false,
          },
          metrics: {
            durationMs: Date.now() - startTime,
            tier: this.tier,
          },
        };

        await this.logExecution(decision, result);
        return result;
      }

      throw new Error("Failed to create dynamic agent");
    } catch (error) {
      this.status = "failed";
      const errorMsg = error instanceof Error ? error.message : String(error);

      const result: ExecutionResult = {
        success: false,
        action: decision.action,
        error: errorMsg,
        metrics: { durationMs: Date.now() - startTime },
      };

      await this.logExecution(decision, result, errorMsg);
      return result;
    }
  }

  // ============================================================================
  // DYNAMIC AGENT CREATION
  // ============================================================================

  private createDynamicAgent(
    config: Partial<AgentRegistration>,
  ): AgentRegistration | null {
    if (!config.id || !config.name || !config.capabilities?.length) {
      return null;
    }

    const registration: AgentRegistration = {
      id: config.id,
      name: config.name,
      tier: config.tier || AGENT_TIERS.BALANCED,
      capabilities: config.capabilities,
      factory: (ctx) => new DynamicAgent(ctx, config),
      maxInstances: config.maxInstances || 1,
      cooldownMs: config.cooldownMs || 5 * 60 * 1000, // 5 minutes default
      description: config.description || `Dynamic agent: ${config.name}`,
    };

    // Register the agent
    const registry = getAgentRegistry();
    registry.register(registration);

    logger.info(`[Spawner] Registered dynamic agent: ${config.name}`);
    return registration;
  }

  // ============================================================================
  // CUSTOM AGENT NEEDS
  // ============================================================================

  private async checkCustomAgentNeeds(
    tenantId: string,
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
  ): Promise<Decision | null> {
    // Check for patterns that suggest need for custom agent
    const { data: patterns } = await this.supabase
      .from("user_patterns")
      .select("pattern_type, description, suggested_automation")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("automation_enabled", true)
      .is("suggested_automation", "not.null");

    if (!patterns || patterns.length === 0) {
      return null;
    }

    // Find patterns without corresponding agents
    const registry = getAgentRegistry();
    for (const pattern of patterns) {
      const capability = `pattern_${pattern.pattern_type}`;
      const existing = registry.findByCapability(capability);

      if (existing.length === 0) {
        // Suggest creating an agent for this pattern
        return {
          action: "spawn_agent",
          confidence: 0.6,
          reasoning: `Pattern "${pattern.description}" needs handling`,
          params: {
            trigger: "pattern_automation",
            agentConfig: {
              id: `pattern-${pattern.pattern_type}-handler`,
              name: `${pattern.pattern_type} Pattern Handler`,
              tier: AGENT_TIERS.BALANCED,
              capabilities: [capability, pattern.pattern_type],
            },
            priority: "low" as SpawnRequest["priority"],
          },
          urgency: "background",
        };
      }
    }

    return null;
  }

  // ============================================================================
  // LOGGING
  // ============================================================================

  private async logSpawn(
    tenantId: string,
    trigger: string,
    agent: AgentRegistration,
  ): Promise<void> {
    await this.supabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: "agent_spawned",
      data: {
        trigger,
        agentId: agent.id,
        agentName: agent.name,
        capabilities: agent.capabilities,
        tier: agent.tier,
      },
      agent_id: this.id,
    });
  }
}

// ============================================================================
// DYNAMIC AGENT
// ============================================================================

/**
 * A generic dynamic agent created at runtime
 */
class DynamicAgent extends BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly tier: AgentTier;
  readonly capabilities: string[];

  private config: Partial<AgentRegistration>;

  constructor(context: AgentContext, config: Partial<AgentRegistration>) {
    super(context);
    this.config = config;
    this.id = config.id || `dynamic-${Date.now()}`;
    this.name = config.name || "Dynamic Agent";
    this.tier = config.tier || AGENT_TIERS.BALANCED;
    this.capabilities = config.capabilities || [];
  }

  async decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    _context?: AgentContext,
  ): Promise<Decision[]> {
    // Dynamic agents have simple decision logic
    // They're created for specific purposes defined by their capabilities
    const mainCapability = this.capabilities[0];

    return [
      {
        action: mainCapability,
        confidence: 0.7,
        reasoning: `Dynamic agent handling ${mainCapability}`,
        params: {
          resources: {
            conversations: resources.availableData.conversations,
            tasks: resources.availableData.tasks,
          },
          environment: {
            timeOfDay: environment.timeOfDay,
            pendingTasks: environment.pendingTasks,
            urgentItems: environment.urgentItems,
          },
        },
        urgency: "soon",
      },
    ];
  }

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Dynamic agents log their execution but actual logic
    // should be implemented based on capability
    logger.info(`[DynamicAgent:${this.name}] Executing ${decision.action}`);

    // For now, just log the action - actual implementation
    // would route to specific handlers based on capability
    await this.logExecution(decision, {
      success: true,
      action: decision.action,
      data: { message: "Dynamic agent executed" },
      metrics: { durationMs: Date.now() - startTime },
    });

    return {
      success: true,
      action: decision.action,
      data: {
        agentId: this.id,
        capability: this.capabilities[0],
        executed: true,
      },
      metrics: {
        durationMs: Date.now() - startTime,
        tier: this.tier,
      },
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function checkAndSpawnAgents(tenantId: string): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  const context: AgentContext = {
    tenantId,
    depth: 0,
    startedAt: new Date().toISOString(),
  };

  const spawner = new SpawnerAgent(context);

  try {
    await spawner.onSpawn?.();

    const resources = await spawner.analyzeResources(tenantId);
    const environment = await spawner.analyzeEnvironment(tenantId);
    const decisions = await spawner.decide(resources, environment, context);

    if (decisions.length === 0) {
      return { success: true, result: { agentsSpawned: 0 } };
    }

    // Execute all spawn decisions
    const results = await Promise.all(decisions.map((d) => spawner.execute(d)));

    const successful = results.filter((r) => r.success).length;

    return {
      success: true,
      result: {
        agentsSpawned: successful,
        details: results.map((r) => r.data),
      },
    };
  } finally {
    await spawner.onRelease?.();
  }
}

/**
 * Manually spawn an agent by config
 */
export async function spawnCustomAgent(
  tenantId: string,
  config: Partial<AgentRegistration>,
  priority: SpawnRequest["priority"] = "normal",
): Promise<{
  success: boolean;
  agentId?: string;
  error?: string;
}> {
  const context: AgentContext = {
    tenantId,
    depth: 0,
    startedAt: new Date().toISOString(),
  };

  const spawner = new SpawnerAgent(context);

  try {
    const result = await spawner.execute({
      action: "spawn_agent",
      confidence: 1.0,
      reasoning: "Manual spawn request",
      params: {
        trigger: "manual",
        agentConfig: config,
        priority,
      },
      urgency: "immediate",
    });

    return {
      success: result.success,
      agentId: (result.data as any)?.agentId,
      error: result.error,
    };
  } finally {
    await spawner.onRelease?.();
  }
}
