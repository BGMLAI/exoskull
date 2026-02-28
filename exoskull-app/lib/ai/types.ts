/**
 * Multi-Model AI Router - Type Definitions
 *
 * Tier System (2026-02 — Gemini 3.1 Pro migration):
 * - Tier 1: Gemini Flash ($0.50/$3) - Classification, extraction, simple tasks
 * - Tier 2: Gemini 3.1 Pro ($2/$12) + Groq Llama (FREE) - Analysis, reasoning
 * - Tier 3: Gemini 3.1 Pro + DeepSeek R1 + Kimi/Codex - Code gen, deep reasoning
 * - Tier 4: DeepSeek R1 ($0.55/$2.19) + Gemini 3.1 Pro - Strategy, crisis
 *
 * BYOK: Tenant with own Anthropic key → Claude models available as premium fallback
 */

// Model tiers as defined in ARCHITECTURE.md
// Tier 0: Self-hosted (Qwen3-30B, Gemma 4B) — $0/token, fixed monthly cost
export type ModelTier = 0 | 1 | 2 | 3 | 4;

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "kimi"
  | "codex"
  | "groq"
  | "selfhosted";

export type ModelId =
  | "selfhosted-qwen3-30b" // Tier 0 (self-hosted, primary)
  | "selfhosted-gemma-4b" // Tier 0 (self-hosted, fast)
  | "gemini-2.5-flash" // Tier 1 (legacy)
  | "gemini-3-flash" // Tier 1 (primary)
  | "gemini-3-pro" // Tier 2 (legacy)
  | "gemini-3.1-pro" // Tier 2-3 (primary — $2/$12, 77.1% ARC-AGI-2)
  | "claude-3-5-haiku" // Tier 2 (BYOK fallback)
  | "claude-sonnet-4-5" // Tier 3 (BYOK fallback)
  | "kimi-k2.5" // Tier 3 (long context)
  | "codex-5-2" // Tier 3 (code generation)
  | "claude-opus-4-5" // Tier 4 (legacy)
  | "claude-opus-4-6" // Tier 4 (BYOK only)
  | "deepseek-r1" // Tier 4 primary ($0.55/$2.19, deep reasoning)
  | "deepseek-v3" // Tier 3 fallback ($0.27/$1.10, fast)
  | "groq-llama-3.3-70b"; // Tier 2 fallback (FREE, 30 RPM)

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
  | "content_generation" // Tier 3: Documents, presentations, marketing content
  | "strategic" // Tier 4: Coaching, mentoring, planning, life strategy
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
  /** BGML quality score (0-100) if scored via pipeline */
  qualityScore?: number;
  /** BGML domain classification */
  bgmlDomain?: string;
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
  contextWindow?: number; // Max input context window (tokens)
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision?: boolean;
  supportsStructuredOutput?: boolean;
  supportsNativeAudio?: boolean;
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
