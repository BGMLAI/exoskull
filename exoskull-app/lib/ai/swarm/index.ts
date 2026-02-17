/**
 * Swarm Module — Agent Swarm Orchestration (Layer 4)
 *
 * Usage:
 * ```typescript
 * import { executeSwarm, getSwarmDefinition, collectSwarmContext } from '@/lib/ai/swarm'
 *
 * const definition = getSwarmDefinition('morning_checkin')!
 * const context = await collectSwarmContext(supabase, tenantId, 'morning_checkin')
 * const result = await executeSwarm(definition, context)
 * ```
 */

export { executeSwarm } from "./orchestrator";

export { getSwarmDefinition } from "./definitions";

export { collectSwarmContext } from "./data-collectors";
