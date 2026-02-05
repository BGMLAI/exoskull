/**
 * Multi-Model AI Router - Type Definitions
 *
 * Tier System:
 * - Tier 1: Gemini 1.5 Flash - Ultra-cheap for simple tasks
 * - Tier 2: Claude 3.5 Haiku - Pattern detection, summarization
 * - Tier 3: Kimi K2.5 - Complex reasoning (placeholder)
 * - Tier 4: Claude Opus 4.5 - Meta-coordination, crisis
 */

// Model tiers as defined in ARCHITECTURE.md
export type ModelTier = 1 | 2 | 3 | 4;

export type ModelProvider = "openai" | "anthropic" | "gemini" | "kimi";

export type ModelId =
  | "gemini-1.5-flash" // Tier 1
  | "claude-3-5-haiku" // Tier 2
  | "claude-sonnet-4-5" // Tier 3
  | "kimi-k2.5" // Tier 3
  | "claude-opus-4-5"; // Tier 4

// Task complexity levels
export type TaskComplexity =
  | "trivial"
  | "simple"
  | "moderate"
  | "complex"
  | "critical";

// Task categories for routing decisions
export type TaskCategory =
  | "classification" // Tier 1: Simple yes/no, routing decisions
  | "extraction" // Tier 1: Data extraction, parsing
  | "simple_response" // Tier 1: Basic responses, greetings
  | "summarization" // Tier 2: Pattern detection, summarization
  | "analysis" // Tier 2: Domain analysis
  | "reasoning" // Tier 3: Complex reasoning
  | "swarm" // Tier 3: Multi-agent coordination
  | "code_generation" // Tier 3: Code generation, skill creation
  | "meta_coordination" // Tier 4: Strategic decisions
  | "crisis"; // Tier 4: Crisis intervention

// Unified message format (compatible with all providers)
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Tool/function definition
export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Request options
export interface AIRequestOptions {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AITool[];
  stream?: boolean;
  // Routing hints
  taskCategory?: TaskCategory;
  forceModel?: ModelId;
  forceTier?: ModelTier;
  // Metadata for tracking
  tenantId?: string;
  requestId?: string;
}

// Response format
export interface AIResponse {
  content: string;
  model: ModelId;
  tier: ModelTier;
  provider: ModelProvider;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  toolCalls?: AIToolCall[];
  latencyMs: number;
}

export interface AIToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Streaming response chunk
export interface AIStreamChunk {
  content: string;
  done: boolean;
  model?: ModelId;
}

// Circuit breaker state
export interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: "closed" | "open" | "half-open";
  cooldownUntil: Date | null;
}

// Usage tracking record
export interface AIUsageRecord {
  id: string;
  tenantId: string | null;
  model: ModelId;
  tier: ModelTier;
  taskCategory: TaskCategory | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

// Provider interface
export interface IAIProvider {
  readonly provider: ModelProvider;
  readonly supportedModels: ModelId[];

  // Core methods
  chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse>;

  // Health check
  isAvailable(): Promise<boolean>;

  // Cost calculation
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelId,
  ): number;
}

// Model configuration
export interface ModelConfig {
  id: ModelId;
  provider: ModelProvider;
  tier: ModelTier;
  displayName: string;
  inputCostPer1M: number; // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  maxTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

// Task classification result
export interface TaskClassification {
  complexity: TaskComplexity;
  category: TaskCategory;
  suggestedTier: ModelTier;
  confidence: number;
  reasoning?: string;
}

// Routing error
export class AIRoutingError extends Error {
  constructor(
    message: string,
    public readonly attemptedModels: ModelId[] = [],
    public readonly lastError?: Error,
  ) {
    super(message);
    this.name = "AIRoutingError";
  }
}

// Provider error
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ModelProvider,
    public readonly model: ModelId,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
