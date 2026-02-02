/**
 * Agent Framework Types
 *
 * ExoSkull Dynamic Agent System
 * Resources -> Environment -> Decision -> Execute
 */

// ============================================================================
// AGENT TIERS (aligned with ModelRouter)
// ============================================================================

export type AgentTier = 1 | 2 | 3 | 4

export const AGENT_TIERS = {
  FLASH: 1 as AgentTier,      // Gemini Flash - ultra-cheap, simple tasks
  BALANCED: 2 as AgentTier,   // Claude Haiku - analysis, summarization
  DEEP: 3 as AgentTier,       // Kimi K2.5 - complex reasoning
  CRITICAL: 4 as AgentTier,   // Claude Opus - meta-coordination, crisis
} as const

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed'

// ============================================================================
// RESOURCE ANALYSIS (What do we have?)
// ============================================================================

export interface ResourceAnalysis {
  // Available data
  availableData: {
    conversations: number
    highlights: number
    tasks: number
    patterns: number
    mits: number
  }

  // External integrations
  connectedRigs: string[]
  activeModules: string[]

  // AI model availability (circuit breaker state)
  modelAvailability: Record<string, boolean>

  // User quotas
  quotas: {
    aiCallsRemaining: number
    storageUsedMb: number
    apiCallsToday: number
  }
}

// ============================================================================
// ENVIRONMENT ANALYSIS (What's the context?)
// ============================================================================

export interface EnvironmentAnalysis {
  // Temporal context
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night'
  dayOfWeek: number // 0-6
  isWeekend: boolean
  isQuietHours: boolean

  // User state
  userMood?: 'energetic' | 'tired' | 'stressed' | 'neutral' | 'unknown'
  lastConversationAgo: number // minutes since last interaction
  recentActivityLevel: 'high' | 'medium' | 'low' | 'none'

  // Task state
  pendingTasks: number
  urgentItems: number
  overdueTasks: number

  // External factors
  calendarBusy: boolean
  upcomingEvents: number // next 24h

  // System state
  lastHighlightExtraction: string | null // ISO timestamp
  lastMitDetection: string | null
}

// ============================================================================
// DECISION (What to do?)
// ============================================================================

export type DecisionUrgency = 'immediate' | 'soon' | 'background'

export interface Decision {
  action: string
  confidence: number // 0-1
  reasoning: string
  params: Record<string, unknown>
  urgency: DecisionUrgency
  estimatedTokens?: number
  requiredTier?: AgentTier
}

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export interface ExecutionResult {
  success: boolean
  action: string
  data?: unknown
  error?: string
  metrics: {
    durationMs: number
    tokensUsed?: number
    modelUsed?: string
    tier?: AgentTier
  }
}

// ============================================================================
// IAGENT INTERFACE (Core contract)
// ============================================================================

export interface IAgent {
  // Identity
  readonly id: string
  readonly name: string
  readonly tier: AgentTier
  readonly capabilities: string[]

  // Resources -> Environment -> Decision -> Execute Framework
  analyzeResources(tenantId: string): Promise<ResourceAnalysis>
  analyzeEnvironment(tenantId: string): Promise<EnvironmentAnalysis>
  decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    context?: AgentContext
  ): Promise<Decision[]>
  execute(decision: Decision): Promise<ExecutionResult>

  // Lifecycle
  canHandle(task: string): boolean
  getStatus(): AgentStatus

  // Optional hooks
  onSpawn?(): Promise<void>
  onRelease?(): Promise<void>
}

// ============================================================================
// AGENT CONTEXT (Shared state)
// ============================================================================

export interface AgentContext {
  tenantId: string
  conversationId?: string
  parentAgentId?: string
  depth: number // nesting level (max 3)
  startedAt: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// AGENT REGISTRY TYPES
// ============================================================================

export interface AgentRegistration {
  id: string
  name: string
  tier: AgentTier
  capabilities: string[]
  factory: (context: AgentContext) => IAgent
  maxInstances: number
  cooldownMs: number
  description: string
}

export interface SpawnRequest {
  task: string
  tenantId: string
  priority: 'low' | 'normal' | 'high' | 'critical'
  context?: Record<string, unknown>
  preferredTier?: AgentTier
}

export interface AgentStats {
  totalSpawned: number
  currentlyActive: number
  byTier: Record<AgentTier, number>
  failures: number
  avgDurationMs: number
}

export interface IAgentRegistry {
  register(agent: AgentRegistration): void
  unregister(agentId: string): void
  spawn(request: SpawnRequest): Promise<IAgent | null>
  getActive(tenantId: string): IAgent[]
  release(agentId: string): void
  getStats(): AgentStats
  findByCapability(capability: string): AgentRegistration[]
}

// ============================================================================
// SPECIALIZED AGENT TYPES
// ============================================================================

// MIT Detector
export interface MIT {
  rank: 1 | 2 | 3
  objective: string
  reasoning: string
  importance: number // 1-10
  urgency: number // 1-10
  impact: number // 1-10
  score: number // computed
  sources: string[] // conversation IDs
  lastMentioned: string // ISO timestamp
}

export interface MITDetectionResult {
  mits: MIT[]
  analysisWindow: string // "30d"
  conversationsAnalyzed: number
  confidence: number
}

// Clarifying Agent
export interface ClarifiedEssence {
  facts: string[]
  actualSituation: string
  coreQuestion: string
  emotionsDetected: string[]
  suggestedActions: string[]
  confidence: number
}

// Highlight Extractor
export interface HighlightCandidate {
  content: string
  category: 'preference' | 'pattern' | 'goal' | 'insight' | 'relationship'
  importance: number
  source: 'conversation' | 'analysis'
  conversationId: string
  confidence: number
}

export interface ExtractionResult {
  candidates: HighlightCandidate[]
  highlightsAdded: number
  highlightsBoosted: number
  processingTimeMs: number
}

// Pattern Learner
export interface DetectedPattern {
  type: 'sleep' | 'productivity' | 'social' | 'health' | 'finance' | 'custom'
  description: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'irregular'
  confidence: number
  dataPoints: number
  suggestedAutomation?: string
}

export interface PatternLearningResult {
  patterns: DetectedPattern[]
  newPatterns: number
  updatedPatterns: number
  analysisWindow: string
}

// ============================================================================
// SELF-UPDATING TYPES
// ============================================================================

export interface LearningEvent {
  type:
    | 'highlight_added'
    | 'highlight_boosted'
    | 'highlight_decayed'
    | 'pattern_detected'
    | 'mit_updated'
    | 'agent_completed'
    | 'decay_completed'
  tenantId: string
  data: Record<string, unknown>
  timestamp: string
  agentId?: string
}

export interface SelfUpdateResult {
  highlightsAdded: number
  highlightsBoosted: number
  highlightsDecayed: number
  patternsDetected: string[]
  mitsUpdated: boolean
  processingTimeMs: number
  conversationsProcessed: number
}

// ============================================================================
// DATABASE TYPES (aligned with migrations)
// ============================================================================

export interface AgentExecutionLog {
  id: string
  tenant_id: string
  agent_id: string
  agent_name: string
  tier: number
  decision: Decision
  result?: ExecutionResult
  status: AgentStatus
  started_at: string
  completed_at?: string
  duration_ms?: number
  tokens_used?: number
  model_used?: string
  error?: string
}

export interface UserMIT {
  id: string
  tenant_id: string
  rank: 1 | 2 | 3
  objective: string
  reasoning?: string
  importance: number
  urgency: number
  impact: number
  score: number
  sources?: string[]
  last_mentioned?: string
  created_at: string
  updated_at: string
}
