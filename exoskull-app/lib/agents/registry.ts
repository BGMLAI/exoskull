/**
 * Agent Registry
 *
 * Singleton registry for managing agent lifecycle:
 * - Registration of agent types
 * - Spawning agents based on task requirements
 * - Tracking active agents
 * - Cooldown and rate limiting
 */

import {
  IAgent,
  IAgentRegistry,
  AgentRegistration,
  SpawnRequest,
  AgentStats,
  AgentTier,
  AgentContext,
} from "./types";
import { createAgentContext } from "./core/agent-context";

import { logger } from "@/lib/logger";
// ============================================================================
// AGENT REGISTRY IMPLEMENTATION
// ============================================================================

class AgentRegistryImpl implements IAgentRegistry {
  private registrations: Map<string, AgentRegistration> = new Map();
  private activeAgents: Map<string, IAgent[]> = new Map(); // agentId -> instances
  private cooldowns: Map<string, number> = new Map(); // agentId -> lastSpawnTime
  private tenantAgents: Map<string, Set<string>> = new Map(); // tenantId -> agentIds

  // Stats
  private totalSpawned = 0;
  private failures = 0;
  private totalDuration = 0;
  private completedCount = 0;

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  register(agent: AgentRegistration): void {
    if (this.registrations.has(agent.id)) {
      logger.warn(
        `[AgentRegistry] Agent ${agent.id} already registered, updating...`,
      );
    }

    this.registrations.set(agent.id, agent);
    logger.info(
      `[AgentRegistry] Registered agent: ${agent.name} (tier ${agent.tier}, caps: ${agent.capabilities.join(", ")})`,
    );
  }

  unregister(agentId: string): void {
    this.registrations.delete(agentId);
    logger.info(`[AgentRegistry] Unregistered agent: ${agentId}`);
  }

  // ============================================================================
  // SPAWNING
  // ============================================================================

  async spawn(request: SpawnRequest): Promise<IAgent | null> {
    logger.info(
      `[AgentRegistry] Spawn request: task="${request.task}", tenant=${request.tenantId}, priority=${request.priority}`,
    );

    // 1. Find matching agents by capability
    const matching = this.findByCapability(request.task)
      .filter((reg) => {
        // Filter by preferred tier if specified
        if (request.preferredTier !== undefined) {
          return reg.tier <= request.preferredTier;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by: priority match, then tier (prefer lower/cheaper)
        if (request.priority === "critical" && a.tier === 4) return -1;
        if (request.priority === "critical" && b.tier === 4) return 1;
        return a.tier - b.tier;
      });

    if (matching.length === 0) {
      logger.warn(`[AgentRegistry] No agent can handle task: ${request.task}`);
      return null;
    }

    // 2. Try each matching agent until one succeeds
    for (const registration of matching) {
      const agent = await this.trySpawn(registration, request);
      if (agent) {
        return agent;
      }
    }

    logger.warn(
      `[AgentRegistry] All matching agents unavailable for: ${request.task}`,
    );
    this.failures++;
    return null;
  }

  private async trySpawn(
    registration: AgentRegistration,
    request: SpawnRequest,
  ): Promise<IAgent | null> {
    const { id, name, cooldownMs, maxInstances, factory } = registration;

    // Check cooldown
    const lastSpawn = this.cooldowns.get(id) || 0;
    const cooldownRemaining = cooldownMs - (Date.now() - lastSpawn);
    if (cooldownRemaining > 0) {
      logger.info(
        `[AgentRegistry] Agent ${name} on cooldown (${cooldownRemaining}ms remaining)`,
      );
      return null;
    }

    // Check max instances
    const active = this.activeAgents.get(id) || [];
    if (active.length >= maxInstances) {
      logger.info(
        `[AgentRegistry] Agent ${name} at max instances (${maxInstances})`,
      );
      return null;
    }

    // Create context
    const context: AgentContext = createAgentContext(request.tenantId, {
      metadata: request.context,
    });

    // Spawn
    try {
      const agent = factory(context);

      // Track
      active.push(agent);
      this.activeAgents.set(id, active);
      this.cooldowns.set(id, Date.now());
      this.totalSpawned++;

      // Track by tenant
      const tenantSet = this.tenantAgents.get(request.tenantId) || new Set();
      tenantSet.add(`${id}:${Date.now()}`);
      this.tenantAgents.set(request.tenantId, tenantSet);

      // Initialize
      if (agent.onSpawn) {
        await agent.onSpawn();
      }

      logger.info(
        `[AgentRegistry] Spawned ${name} for tenant ${request.tenantId} (total active: ${active.length})`,
      );
      return agent;
    } catch (error) {
      console.error(`[AgentRegistry] Failed to spawn ${name}:`, error);
      this.failures++;
      return null;
    }
  }

  // ============================================================================
  // ACTIVE AGENT MANAGEMENT
  // ============================================================================

  getActive(tenantId: string): IAgent[] {
    const result: IAgent[] = [];
    for (const [, agents] of this.activeAgents) {
      for (const agent of agents) {
        // Check if agent belongs to tenant (via context)
        // Note: This requires agents to expose their context
        // For now, return all active agents
        result.push(agent);
      }
    }
    return result;
  }

  release(agentId: string): void {
    for (const [registrationId, agents] of this.activeAgents) {
      const index = agents.findIndex((a) => a.id === agentId);
      if (index !== -1) {
        const agent = agents[index];

        // Calculate duration for stats
        const status = agent.getStatus();
        if (status === "completed") {
          this.completedCount++;
          // Note: Duration tracking would need to be added to agent
        }

        // Release
        if (agent.onRelease) {
          agent.onRelease().catch((err) => {
            console.error(`[AgentRegistry] Error during release:`, err);
          });
        }

        agents.splice(index, 1);
        this.activeAgents.set(registrationId, agents);
        logger.info(`[AgentRegistry] Released agent: ${agentId}`);
        return;
      }
    }
    logger.warn(`[AgentRegistry] Agent not found for release: ${agentId}`);
  }

  // ============================================================================
  // QUERYING
  // ============================================================================

  findByCapability(capability: string): AgentRegistration[] {
    const results: AgentRegistration[] = [];
    const lowerCap = capability.toLowerCase();

    for (const reg of this.registrations.values()) {
      if (
        reg.capabilities.some((c) => {
          const lowerC = c.toLowerCase();
          return lowerCap.includes(lowerC) || lowerC.includes(lowerCap);
        })
      ) {
        results.push(reg);
      }
    }

    return results;
  }

  findByTier(tier: AgentTier): AgentRegistration[] {
    return Array.from(this.registrations.values()).filter(
      (r) => r.tier === tier,
    );
  }

  getRegistration(agentId: string): AgentRegistration | undefined {
    return this.registrations.get(agentId);
  }

  // ============================================================================
  // STATS
  // ============================================================================

  getStats(): AgentStats {
    let currentlyActive = 0;
    const byTier: Record<AgentTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const [regId, agents] of this.activeAgents) {
      currentlyActive += agents.length;
      const reg = this.registrations.get(regId);
      if (reg) {
        byTier[reg.tier] += agents.length;
      }
    }

    return {
      totalSpawned: this.totalSpawned,
      currentlyActive,
      byTier,
      failures: this.failures,
      avgDurationMs:
        this.completedCount > 0 ? this.totalDuration / this.completedCount : 0,
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  listRegistrations(): AgentRegistration[] {
    return Array.from(this.registrations.values());
  }

  clear(): void {
    // Release all active agents
    for (const agents of this.activeAgents.values()) {
      for (const agent of agents) {
        if (agent.onRelease) {
          agent
            .onRelease()
            .catch((err) =>
              logger.warn(
                "[AgentRegistry] Agent release failed:",
                err instanceof Error ? err.message : err,
              ),
            );
        }
      }
    }

    this.registrations.clear();
    this.activeAgents.clear();
    this.cooldowns.clear();
    this.tenantAgents.clear();
    logger.info("[AgentRegistry] Cleared all registrations and active agents");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let registryInstance: AgentRegistryImpl | null = null;

export function getAgentRegistry(): IAgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistryImpl();
  }
  return registryInstance;
}

// For testing
export function resetRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick spawn helper
 */
export async function spawnAgent(
  task: string,
  tenantId: string,
  options?: {
    priority?: SpawnRequest["priority"];
    preferredTier?: AgentTier;
    context?: Record<string, unknown>;
  },
): Promise<IAgent | null> {
  const registry = getAgentRegistry();
  return registry.spawn({
    task,
    tenantId,
    priority: options?.priority || "normal",
    preferredTier: options?.preferredTier,
    context: options?.context,
  });
}

/**
 * Run an agent task end-to-end
 */
export async function runAgentTask(
  task: string,
  tenantId: string,
  options?: {
    priority?: SpawnRequest["priority"];
    preferredTier?: AgentTier;
    context?: Record<string, unknown>;
  },
): Promise<{
  success: boolean;
  agent?: string;
  result?: unknown;
  error?: string;
}> {
  const registry = getAgentRegistry();
  const agent = await registry.spawn({
    task,
    tenantId,
    priority: options?.priority || "normal",
    preferredTier: options?.preferredTier,
    context: options?.context,
  });

  if (!agent) {
    return {
      success: false,
      error: `No agent available for task: ${task}`,
    };
  }

  try {
    // Run the full pipeline
    const resources = await agent.analyzeResources(tenantId);
    const environment = await agent.analyzeEnvironment(tenantId);
    const decisions = await agent.decide(resources, environment);

    if (decisions.length === 0) {
      return {
        success: true,
        agent: agent.name,
        result: { action: "no_action_needed" },
      };
    }

    // Execute first decision (could be modified to execute all)
    const result = await agent.execute(decisions[0]);

    return {
      success: result.success,
      agent: agent.name,
      result: result.data,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      agent: agent.name,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    registry.release(agent.id);
  }
}
