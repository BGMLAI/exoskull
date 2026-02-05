/**
 * Multi-Model AI Router - Configuration
 *
 * Model pricing and configuration for each tier.
 * Prices as of 2026-02.
 */

import { ModelConfig, ModelId, ModelTier, TaskCategory } from "./types";

// Model configurations
export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  "gemini-1.5-flash": {
    id: "gemini-1.5-flash",
    provider: "gemini",
    tier: 1,
    displayName: "Gemini 1.5 Flash",
    inputCostPer1M: 0.075, // $0.075 per 1M input tokens
    outputCostPer1M: 0.3, // $0.30 per 1M output tokens
    maxTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  "claude-3-5-haiku": {
    id: "claude-3-5-haiku",
    provider: "anthropic",
    tier: 2,
    displayName: "Claude 3.5 Haiku",
    inputCostPer1M: 0.8, // $0.80 per 1M input tokens
    outputCostPer1M: 4.0, // $4.00 per 1M output tokens
    maxTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    provider: "anthropic",
    tier: 3,
    displayName: "Claude Sonnet 4.5",
    inputCostPer1M: 3.0, // $3 per 1M input tokens
    outputCostPer1M: 15.0, // $15 per 1M output tokens
    maxTokens: 16384,
    supportsTools: true,
    supportsStreaming: true,
  },
  "kimi-k2.5": {
    id: "kimi-k2.5",
    provider: "kimi",
    tier: 3,
    displayName: "Kimi K2.5",
    inputCostPer1M: 0.6, // $0.60 per 1M input tokens
    outputCostPer1M: 2.5, // $2.50 per 1M output tokens
    maxTokens: 256000, // 256K context window
    supportsTools: true,
    supportsStreaming: true,
  },
  "claude-opus-4-5": {
    id: "claude-opus-4-5",
    provider: "anthropic",
    tier: 4,
    displayName: "Claude Opus 4.5",
    inputCostPer1M: 15.0, // $15 per 1M input tokens
    outputCostPer1M: 75.0, // $75 per 1M output tokens
    maxTokens: 32000,
    supportsTools: true,
    supportsStreaming: true,
  },
};

// Tier to model mapping (order = priority within tier)
export const TIER_MODELS: Record<ModelTier, ModelId[]> = {
  1: ["gemini-1.5-flash"],
  2: ["claude-3-5-haiku"],
  3: ["claude-sonnet-4-5", "kimi-k2.5"],
  4: ["claude-opus-4-5", "claude-sonnet-4-5"],
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
  swarm: 3,
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
