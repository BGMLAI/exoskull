/**
 * Learning Module Index
 *
 * ExoSkull Self-Updating System
 */

// Self-Updater
export {
  SelfUpdater,
  getSelfUpdater,
  runSelfUpdate,
  runDecay,
  processConversationNow,
} from './self-updater'

// Highlight Integrator
export {
  loadHighlightsForPrompt,
  loadMITsForPrompt,
  loadMemoryContext,
  getMemoryVariables,
  type MIT,
  type MemoryContext,
} from './highlight-integrator'
