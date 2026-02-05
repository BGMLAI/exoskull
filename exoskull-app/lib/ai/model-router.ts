/**
 * Multi-Model AI Router
 *
 * Central routing logic that:
 * 1. Classifies incoming tasks
 * 2. Routes to appropriate model tier
 * 3. Handles failures with escalation
 * 4. Tracks usage and costs
 */

import {
  IAIProvider,
  ModelId,
  ModelTier,
  ModelProvider,
  AIRequestOptions,
  AIResponse,
  AIRoutingError,
} from "./types";
import { classifyTask } from "./task-classifier";
import { getCircuitBreaker } from "./circuit-breaker";
import { getModelsForTier, getModelConfig, ROUTER_CONFIG } from "./config";
import { GeminiProvider, AnthropicProvider, KimiProvider } from "./providers";

export class ModelRouter {
  private providers: Map<ModelProvider, IAIProvider> = new Map();
  private taskHistory: Map<string, ModelId[]> = new Map(); // tenant:category -> successful models

  constructor() {
    // Initialize providers
    this.providers.set("gemini", new GeminiProvider());
    this.providers.set("anthropic", new AnthropicProvider());
    this.providers.set("kimi", new KimiProvider());
  }

  /**
   * Route a request to the appropriate model
   */
  async route(options: AIRequestOptions): Promise<AIResponse> {
    const circuitBreaker = getCircuitBreaker();
    const attemptedModels: ModelId[] = [];

    // 1. Check for forced model
    if (options.forceModel) {
      return this.executeWithModel(
        options,
        options.forceModel,
        attemptedModels,
      );
    }

    // 2. Classify task
    const classification = classifyTask(options);
    const effectiveTier = options.forceTier ?? classification.suggestedTier;

    if (ROUTER_CONFIG.logLevel === "debug") {
      console.debug("[ModelRouter] Classification:", {
        category: classification.category,
        complexity: classification.complexity,
        suggestedTier: classification.suggestedTier,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      });
    }

    // 3. Check task history for successful models
    const historyKey = `${options.tenantId || "default"}:${classification.category}`;
    const pastSuccessfulModels = this.taskHistory.get(historyKey) || [];

    // Try past successful model first (if circuit is closed)
    for (const model of pastSuccessfulModels) {
      if (circuitBreaker.isAllowed(model)) {
        try {
          const response = await this.executeWithModel(
            options,
            model,
            attemptedModels,
          );
          return response;
        } catch {
          // Continue to tier-based routing
        }
      }
    }

    // 4. Route to tier with fallback/escalation
    return this.routeToTier(
      options,
      effectiveTier,
      attemptedModels,
      classification.category,
    );
  }

  /**
   * Route to a specific tier with fallback
   */
  private async routeToTier(
    options: AIRequestOptions,
    tier: ModelTier,
    attemptedModels: ModelId[],
    category: string,
    escalationCount = 0,
  ): Promise<AIResponse> {
    const circuitBreaker = getCircuitBreaker();
    const tierModels = getModelsForTier(tier);

    // Try each model in the tier
    for (const model of tierModels) {
      if (attemptedModels.includes(model)) continue;
      if (!circuitBreaker.isAllowed(model)) continue;

      try {
        const response = await this.executeWithModel(
          options,
          model,
          attemptedModels,
        );

        // Record success for future routing
        this.recordSuccess(options.tenantId, category, model);

        return response;
      } catch (error) {
        console.warn(`[ModelRouter] ${model} failed, trying next...`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Escalate to next tier if allowed
    if (escalationCount < ROUTER_CONFIG.maxEscalations && tier < 4) {
      console.info(
        `[ModelRouter] Escalating from Tier ${tier} to Tier ${tier + 1}`,
      );
      return this.routeToTier(
        options,
        (tier + 1) as ModelTier,
        attemptedModels,
        category,
        escalationCount + 1,
      );
    }

    // De-escalate: if we started at a high tier and failed, try lower tiers
    if (tier > 1) {
      for (
        let fallbackTier = (tier - 1) as ModelTier;
        fallbackTier >= 1;
        fallbackTier = (fallbackTier - 1) as ModelTier
      ) {
        const fallbackModels = getModelsForTier(fallbackTier);
        const untried = fallbackModels.filter(
          (m) => !attemptedModels.includes(m) && circuitBreaker.isAllowed(m),
        );

        if (untried.length > 0) {
          console.info(
            `[ModelRouter] De-escalating to Tier ${fallbackTier} (fallback)`,
          );
          for (const model of untried) {
            try {
              const response = await this.executeWithModel(
                options,
                model,
                attemptedModels,
              );
              this.recordSuccess(options.tenantId, category, model);
              return response;
            } catch (error) {
              console.warn(`[ModelRouter] Fallback ${model} failed`, {
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }
        }

        if (fallbackTier === 1) break;
      }
    }

    // All tiers exhausted
    throw new AIRoutingError(
      `All models failed (tried: ${attemptedModels.join(", ")})`,
      attemptedModels,
    );
  }

  /**
   * Execute request with a specific model
   */
  private async executeWithModel(
    options: AIRequestOptions,
    model: ModelId,
    attemptedModels: ModelId[],
  ): Promise<AIResponse> {
    attemptedModels.push(model);

    const config = getModelConfig(model);
    const provider = this.providers.get(config.provider);

    if (!provider) {
      throw new AIRoutingError(
        `No provider for model ${model}`,
        attemptedModels,
      );
    }

    const circuitBreaker = getCircuitBreaker();

    try {
      const response = await provider.chat(options, model);

      // Record success in circuit breaker
      circuitBreaker.recordSuccess(model);

      // Log usage if enabled
      if (ROUTER_CONFIG.enableUsageTracking) {
        this.logUsage(options, response);
      }

      return response;
    } catch (error) {
      // Record failure in circuit breaker
      circuitBreaker.recordFailure(
        model,
        error instanceof Error ? error : undefined,
      );
      throw error;
    }
  }

  /**
   * Record successful model for a task type
   */
  private recordSuccess(
    tenantId: string | undefined,
    category: string,
    model: ModelId,
  ): void {
    const key = `${tenantId || "default"}:${category}`;
    const history = this.taskHistory.get(key) || [];

    // Keep model at front of history (most recent success)
    const filtered = history.filter((m) => m !== model);
    filtered.unshift(model);

    // Limit history size
    this.taskHistory.set(key, filtered.slice(0, 5));
  }

  /**
   * Log usage (can be extended to write to database)
   */
  private logUsage(options: AIRequestOptions, response: AIResponse): void {
    console.info("[ModelRouter] Usage:", {
      model: response.model,
      tier: response.tier,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cost: `$${response.usage.estimatedCost.toFixed(6)}`,
      latencyMs: response.latencyMs,
      tenantId: options.tenantId,
    });
  }

  /**
   * Get provider availability
   */
  async getProviderStatus(): Promise<Record<ModelProvider, boolean>> {
    const status: Record<ModelProvider, boolean> = {
      gemini: false,
      anthropic: false,
      kimi: false,
      openai: false, // Not used in router but included for completeness
    };

    for (const [provider, instance] of this.providers) {
      try {
        status[provider] = await instance.isAvailable();
      } catch {
        status[provider] = false;
      }
    }

    return status;
  }

  /**
   * Get circuit breaker statuses
   */
  getCircuitBreakerStatus() {
    return getCircuitBreaker().getAllStatuses();
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter();
  }
  return routerInstance;
}
