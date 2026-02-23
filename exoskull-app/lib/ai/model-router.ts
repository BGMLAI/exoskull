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
import {
  GeminiProvider,
  AnthropicProvider,
  KimiProvider,
  CodexProvider,
  SelfHostedProvider,
} from "./providers";

import { logger } from "@/lib/logger";
export class ModelRouter {
  private providers: Map<ModelProvider, IAIProvider> = new Map();
  private taskHistory: Map<string, ModelId[]> = new Map(); // tenant:category -> successful models

  private selfHostedAvailable: boolean | null = null;
  private selfHostedCheckTime = 0;

  constructor() {
    // Initialize providers
    this.providers.set("gemini", new GeminiProvider());
    this.providers.set("anthropic", new AnthropicProvider());
    this.providers.set("kimi", new KimiProvider());
    this.providers.set("codex", new CodexProvider());

    // Self-hosted provider (Tier 0) — only if configured
    if (process.env.SELFHOSTED_API_URL) {
      this.providers.set("selfhosted", new SelfHostedProvider());
    }
  }

  /**
   * Check if self-hosted provider is available (cached 30s)
   */
  private async isSelfHostedAvailable(): Promise<boolean> {
    if (
      this.selfHostedAvailable !== null &&
      Date.now() - this.selfHostedCheckTime < 30_000
    ) {
      return this.selfHostedAvailable;
    }

    const provider = this.providers.get("selfhosted");
    if (!provider) {
      this.selfHostedAvailable = false;
      this.selfHostedCheckTime = Date.now();
      return false;
    }

    try {
      this.selfHostedAvailable = await provider.isAvailable();
    } catch {
      this.selfHostedAvailable = false;
    }
    this.selfHostedCheckTime = Date.now();
    return this.selfHostedAvailable;
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
      logger.debug("[ModelRouter] Classification:", {
        category: classification.category,
        complexity: classification.complexity,
        suggestedTier: classification.suggestedTier,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      });
    }

    // 3. Try self-hosted (Tier 0) for Tier 1-2 tasks when available
    // Skip for Tier 3-4 (code gen needs Codex, crisis needs Opus)
    if (effectiveTier <= 2 && !options.forceModel && !options.forceTier) {
      const selfHostedUp = await this.isSelfHostedAvailable();
      if (selfHostedUp) {
        try {
          // Use Gemma 4B for simple tasks (Tier 1), Qwen3 30B for analysis (Tier 2)
          const selfHostedModel: ModelId =
            effectiveTier === 1
              ? ("selfhosted-gemma-4b" as ModelId)
              : ("selfhosted-qwen3-30b" as ModelId);

          if (circuitBreaker.isAllowed(selfHostedModel)) {
            const response = await this.executeWithModel(
              options,
              selfHostedModel,
              attemptedModels,
            );
            this.recordSuccess(
              options.tenantId,
              classification.category,
              selfHostedModel,
            );
            return response;
          }
        } catch (error) {
          logger.warn(
            "[ModelRouter] Self-hosted failed, falling back to cloud",
            {
              error: error instanceof Error ? error.message : "Unknown",
            },
          );
          // Fall through to cloud routing
        }
      }
    }

    // 4. Check task history for successful models
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

    // 5. Route to tier with fallback/escalation
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
        logger.warn(`[ModelRouter] ${model} failed, trying next...`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Escalate to next tier if allowed
    if (escalationCount < ROUTER_CONFIG.maxEscalations && tier < 4) {
      logger.info(
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
          logger.info(
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
              logger.warn(`[ModelRouter] Fallback ${model} failed`, {
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
   * Log usage to database for admin dashboard tracking
   */
  private logUsage(options: AIRequestOptions, response: AIResponse): void {
    logger.info("[ModelRouter] Usage:", {
      model: response.model,
      tier: response.tier,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cost: `$${response.usage.estimatedCost.toFixed(6)}`,
      latencyMs: response.latencyMs,
      qualityScore: response.qualityScore,
      bgmlDomain: response.bgmlDomain,
      tenantId: options.tenantId,
    });

    // Write to exo_ai_usage table (fire-and-forget)
    import("@/lib/supabase/service").then(({ getServiceSupabase }) => {
      const db = getServiceSupabase();
      db.from("exo_ai_usage")
        .insert({
          tenant_id: options.tenantId || null,
          model: response.model,
          tier: response.tier,
          provider: response.provider || "unknown",
          task_category: options.taskCategory || null,
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
          estimated_cost: response.usage.estimatedCost,
          latency_ms: response.latencyMs,
          success: true,
          request_metadata: {
            quality_score: response.qualityScore,
            bgml_domain: response.bgmlDomain,
          },
        })
        .then(({ error }) => {
          if (error)
            logger.warn("[ModelRouter] Failed to log usage:", error.message);
        });
    });
  }

  /**
   * Record BGML quality score for a model+domain combination.
   * Used by the BGML pipeline to track which models perform best per domain.
   */
  recordQualityScore(
    model: ModelId,
    domain: string,
    qualityScore: number,
    tenantId?: string,
  ): void {
    // Update task history — boost models that score well for a domain
    const key = `${tenantId || "default"}:bgml_${domain}`;
    if (qualityScore >= 70) {
      this.recordSuccess(tenantId, `bgml_${domain}`, model);
    }

    logger.info("[ModelRouter] Quality score recorded:", {
      model,
      domain,
      qualityScore,
      tenantId,
    });
  }

  /**
   * Get provider availability
   */
  async getProviderStatus(): Promise<Record<ModelProvider, boolean>> {
    const status: Record<ModelProvider, boolean> = {
      selfhosted: false,
      gemini: false,
      anthropic: false,
      kimi: false,
      openai: false,
      codex: false,
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
