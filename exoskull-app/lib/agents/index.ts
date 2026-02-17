/**
 * Agent Framework Index
 *
 * ExoSkull Dynamic Agent System
 * Resources -> Environment -> Decision -> Execute
 */

// Specialized Agents (only exports actually consumed)
export { detectGaps } from "./specialized/gap-detector";
export { optimizeSystem } from "./specialized/self-optimizer";
export { checkAndSpawnAgents } from "./specialized/spawner";
