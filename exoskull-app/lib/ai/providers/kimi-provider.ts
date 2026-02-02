/**
 * Kimi Provider - Tier 3 (Placeholder)
 *
 * Kimi K2.5 from Moonshot AI
 * - Complex reasoning
 * - Long context (128K+)
 * - Multi-agent swarm coordination
 *
 * NOTE: This is a placeholder implementation.
 * Kimi uses an OpenAI-compatible API format.
 * Actual API access needs to be verified.
 */

import {
  IAIProvider,
  ModelProvider,
  ModelId,
  AIRequestOptions,
  AIResponse,
  AIProviderError
} from '../types'
import { calculateCost } from '../config'

// Moonshot AI (Kimi) API endpoint
const KIMI_BASE_URL = 'https://api.moonshot.cn/v1'

export class KimiProvider implements IAIProvider {
  readonly provider: ModelProvider = 'kimi'
  readonly supportedModels: ModelId[] = ['kimi-k2.5']

  private apiKey: string | null = null

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.KIMI_API_KEY
      if (!key) {
        throw new AIProviderError(
          'KIMI_API_KEY not configured',
          'kimi',
          'kimi-k2.5'
        )
      }
      this.apiKey = key
    }
    return this.apiKey
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now()

    try {
      const apiKey = this.getApiKey()

      // Kimi uses OpenAI-compatible format
      const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-auto', // Auto-selects best model
          messages: options.messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new AIProviderError(
          `Kimi API error: ${response.status} ${response.statusText}`,
          'kimi',
          model,
          response.status
        )
      }

      const data = await response.json()
      const latencyMs = Date.now() - startTime

      const content = data.choices?.[0]?.message?.content ?? ''
      const inputTokens = data.usage?.prompt_tokens ?? 0
      const outputTokens = data.usage?.completion_tokens ?? 0

      return {
        content,
        model,
        tier: 3,
        provider: 'kimi',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: calculateCost(inputTokens, outputTokens, model)
        },
        latencyMs
      }
    } catch (error: unknown) {
      if (error instanceof AIProviderError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[KimiProvider] Chat failed:', {
        error: errorMessage,
        model,
        tenantId: options.tenantId
      })

      throw new AIProviderError(
        `Kimi chat failed: ${errorMessage}`,
        'kimi',
        model
      )
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.KIMI_API_KEY
      return !!apiKey
    } catch {
      return false
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: ModelId): number {
    return calculateCost(inputTokens, outputTokens, model)
  }
}
