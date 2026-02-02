/**
 * Agent Framework Index
 *
 * ExoSkull Dynamic Agent System
 * Resources -> Environment -> Decision -> Execute
 */

// Types
export * from './types'

// Core
export { BaseAgent } from './core/base-agent'
export {
  createAgentContext,
  createChildContext,
  validateContext,
  canSpawnChild,
  getContextAge,
  isContextStale,
} from './core/agent-context'

// Registry
export {
  getAgentRegistry,
  resetRegistry,
  spawnAgent,
  runAgentTask,
} from './registry'

// Coordinator
export {
  MetaCoordinator,
  getMetaCoordinator,
  runCoordinationCycle,
  handleEvent,
  clarify,
  detectMITs,
} from './coordinator'

// Specialized Agents
export { MITDetectorAgent } from './specialized/mit-detector'
export { ClarifyingAgent, clarifyInput } from './specialized/clarifying-agent'
export { HighlightExtractorAgent } from './specialized/highlight-extractor'
export { PatternLearnerAgent } from './specialized/pattern-learner'
