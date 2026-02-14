/**
 * Multi-Model AI Router - Configuration
 *
 * Model pricing and tier configuration.
 * Prices as of 2026-02.
 *
 * Tier 1: Gemini 3 Flash (cheap, fast) — classification, extraction, simple tasks
 * Tier 2: Gemini 3 Pro (balanced) — analysis, summarization, reasoning
 * Tier 3: Codex 5.2 + Sonnet (code) — code generation, app building
 * Tier 4: Claude Opus 4.6 (strategic) — crisis, meta-coordination ONLY
 */

import { ModelConfig, ModelId, ModelTier, TaskCategory } from "./types";

// Model configurations
export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  // ── Tier 0: Self-hosted ($0/token, fixed monthly GPU rental) ──
  "selfhosted-qwen3-30b": {
    id: "selfhosted-qwen3-30b",
    provider: "selfhosted",
    tier: 0,
    displayName: "Qwen3 30B (self-hosted)",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxTokens: 8192,
    contextWindow: 32_000,
    supportsTools: true,
    supportsStreaming: false,
  },
  "selfhosted-gemma-4b": {
    id: "selfhosted-gemma-4b",
    provider: "selfhosted",
    tier: 0,
    displayName: "Gemma 3 4B (self-hosted)",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxTokens: 4096,
    contextWindow: 32_000,
    supportsTools: true,
    supportsStreaming: false,
  },

  // ── Tier 1: Ultra-cheap, ultra-fast ──
  "gemini-3-flash": {
    id: "gemini-3-flash",
    provider: "gemini",
    tier: 1,
    displayName: "Gemini 3 Flash",
    inputCostPer1M: 0.5,
    outputCostPer1M: 3.0,
    maxTokens: 8192,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    provider: "gemini",
    tier: 1,
    displayName: "Gemini 2.5 Flash",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    maxTokens: 8192,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ── Tier 2: Balanced analysis ──
  "gemini-3-pro": {
    id: "gemini-3-pro",
    provider: "gemini",
    tier: 2,
    displayName: "Gemini 3 Pro",
    inputCostPer1M: 2.0,
    outputCostPer1M: 12.0,
    maxTokens: 16384,
    contextWindow: 2_000_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  "claude-3-5-haiku": {
    id: "claude-3-5-haiku",
    provider: "anthropic",
    tier: 2,
    displayName: "Claude 3.5 Haiku",
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ── Tier 3: Code generation + deep reasoning ──
  "codex-5-2": {
    id: "codex-5-2",
    provider: "codex",
    tier: 3,
    displayName: "Codex 5.2",
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.0,
    maxTokens: 16384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: false, // Responses API doesn't stream like chat
  },
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    provider: "anthropic",
    tier: 3,
    displayName: "Claude Sonnet 4.5",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    maxTokens: 16384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
  },
  "kimi-k2.5": {
    id: "kimi-k2.5",
    provider: "kimi",
    tier: 3,
    displayName: "Kimi K2.5",
    inputCostPer1M: 0.6,
    outputCostPer1M: 2.5,
    maxTokens: 256000,
    contextWindow: 256_000,
    supportsTools: true,
    supportsStreaming: true,
  },

  // ── Tier 4: Strategic / Crisis ──
  "claude-opus-4-6": {
    id: "claude-opus-4-6",
    provider: "anthropic",
    tier: 4,
    displayName: "Claude Opus 4.6",
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    maxTokens: 32000,
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
  },
  "claude-opus-4-5": {
    id: "claude-opus-4-5",
    provider: "anthropic",
    tier: 4,
    displayName: "Claude Opus 4.5 (legacy)",
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    maxTokens: 32000,
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
  },
};

// Tier to model mapping (order = priority within tier)
export const TIER_MODELS: Record<ModelTier, ModelId[]> = {
  0: ["selfhosted-qwen3-30b", "selfhosted-gemma-4b"],
  1: ["gemini-3-flash", "gemini-2.5-flash"],
  2: ["gemini-3-pro", "claude-3-5-haiku"],
  3: ["codex-5-2", "claude-sonnet-4-5", "kimi-k2.5"],
  4: ["claude-opus-4-6", "claude-sonnet-4-5"],
};

// Category to tier mapping
export const CATEGORY_TIERS: Record<TaskCategory, ModelTier> = {
  classification: 1,
  extraction: 1,
  simple_response: 1,
  summarization: 2,
  analysis: 2,
  reasoning: 3,
  code_generation: 3,
  content_generation: 3,
  swarm: 3,
  strategic: 4, // Coaching, mentoring, life strategy → Opus for quality
  meta_coordination: 4,
  crisis: 4,
};

// Circuit breaker configuration
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3, // Open after 3 consecutive failures
  cooldownMs: 5 * 60 * 1000, // 5 minutes cooldown
  halfOpenMaxAttempts: 1, // Allow 1 test request in half-open state
};

// Router configuration
export const ROUTER_CONFIG = {
  maxEscalations: 3, // Max tier escalations before giving up
  defaultTemperature: 0.7,
  defaultMaxTokens: 1024,
  enableUsageTracking: true,
  logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
};

// Keywords for task classification
export const CLASSIFICATION_KEYWORDS = {
  tier1: [
    "wybierz",
    "classify",
    "categorize",
    "route",
    "yes/no",
    "tak/nie",
    "extract",
    "parse",
    "greeting",
    "pozdrow",
    "hello",
    "hi",
    "cześć",
  ],
  tier4_crisis: [
    "samobójcz",
    "suicide",
    "kryzys",
    "crisis",
    "przemoc",
    "violence",
    "panic",
    "panika",
    "emergency",
    "nagły",
    "help me",
    "pomóż",
  ],
  tier4_meta: [
    "strategia",
    "strategy",
    "plan długoterminowy",
    "long-term",
    "architecture",
    "architektura",
    "system design",
  ],
  tier4_strategic: [
    "coaching",
    "mentoring",
    "wartości",
    "values",
    "życie",
    "life plan",
    "cele życiowe",
    "life goals",
    "priorytety",
    "priorities",
    "sens życia",
    "meaning",
    "purpose",
    "co jest ważne",
    "what matters",
    "debate",
    "debata",
    "perspektywy",
    "perspectives",
  ],
  tier3_content: [
    "napisz dokument",
    "write document",
    "stwórz prezentac",
    "create presentation",
    "post na",
    "social post",
    "marketing",
    "kampania",
    "campaign",
    "artykuł",
    "article",
    "newsletter",
    "content",
    "treść",
  ],
};

// Helper functions
export function getModelConfig(modelId: ModelId): ModelConfig {
  return MODEL_CONFIGS[modelId];
}

export function getModelsForTier(tier: ModelTier): ModelId[] {
  return TIER_MODELS[tier] || [];
}

export function getTierForCategory(category: TaskCategory): ModelTier {
  return CATEGORY_TIERS[category];
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: ModelId,
): number {
  const config = MODEL_CONFIGS[modelId];
  const inputCost = (inputTokens / 1_000_000) * config.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * config.outputCostPer1M;
  return inputCost + outputCost;
}
