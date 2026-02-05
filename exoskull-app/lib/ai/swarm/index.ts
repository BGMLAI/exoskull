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
export type {
  SwarmAgent,
  SwarmDefinition,
  SwarmAgentResult,
  SwarmResult,
} from "./orchestrator";

export {
  MORNING_CHECKIN_SWARM,
  GAP_DETECTION_SWARM,
  WEEKLY_REVIEW_SWARM,
  SWARM_DEFINITIONS,
  getSwarmDefinition,
} from "./definitions";
export type { SwarmType } from "./definitions";

export { collectSwarmContext } from "./data-collectors";
export type {
  SleepContext,
  ActivityContext,
  MoodContext,
  TaskContext,
  GoalContext,
  ConversationContext,
} from "./data-collectors";
