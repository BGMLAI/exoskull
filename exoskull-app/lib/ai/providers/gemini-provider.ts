/**
 * Gemini Provider - Tier 1
 *
 * Ultra-cheap provider for simple tasks:
 * - Classification
 * - Data extraction
 * - Simple responses
 */

import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai'
import {
  IAIProvider,
  ModelProvider,
  ModelId,
  AIRequestOptions,
  AIResponse,
  AIProviderError
} from '../types'
import { calculateCost } from '../config'

export class GeminiProvider implements IAIProvider {
  readonly provider: ModelProvider = 'gemini'
  readonly supportedModels: ModelId[] = ['gemini-1.5-flash']

  private client: GoogleGenerativeAI | null = null

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY
      if (!apiKey) {
        throw new AIProviderError(
          'GOOGLE_AI_API_KEY not configured',
          'gemini',
          'gemini-1.5-flash'
        )
      }
      this.client = new GoogleGenerativeAI(apiKey)
    }
    return this.client
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now()

    try {
      const client = this.getClient()
      const genModel = client.getGenerativeModel({ model: 'gemini-1.5-flash' })

      // Extract system instruction
      const systemMessage = options.messages.find(m => m.role === 'system')
      const systemInstruction = systemMessage?.content

      // Convert messages to Gemini format
      const history = this.convertToGeminiHistory(options.messages)

      // Get the last user message
      const lastUserMessage = options.messages
        .filter(m => m.role === 'user')
        .pop()

      if (!lastUserMessage) {
        throw new AIProviderError(
          'No user message provided',
          'gemini',
          model
        )
      }

      // Start chat with history
      const chat = genModel.startChat({
        history,
        systemInstruction,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1024
        }
      })

      // Send the last user message
      const result = await chat.sendMessage(lastUserMessage.content)
      const response = result.response

      const latencyMs = Date.now() - startTime

      // Extract usage metadata
      const usageMetadata = response.usageMetadata
      const inputTokens = usageMetadata?.promptTokenCount ?? 0
      const outputTokens = usageMetadata?.candidatesTokenCount ?? 0

      return {
        content: response.text(),
        model,
        tier: 1,
        provider: 'gemini',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: calculateCost(inputTokens, outputTokens, model)
        },
        latencyMs
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[GeminiProvider] Chat failed:', {
        error: errorMessage,
        model,
        tenantId: options.tenantId
      })

      throw new AIProviderError(
        `Gemini chat failed: ${errorMessage}`,
        'gemini',
        model
      )
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.GOOGLE_AI_API_KEY
      return !!apiKey
    } catch {
      return false
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: ModelId): number {
    return calculateCost(inputTokens, outputTokens, model)
  }

  /**
   * Convert messages to Gemini history format
   * Gemini uses 'user' and 'model' roles, not 'assistant'
   */
  private convertToGeminiHistory(messages: AIRequestOptions['messages']): Content[] {
    return messages
      .filter(m => m.role !== 'system') // System handled separately
      .slice(0, -1) // Exclude last message (sent separately)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }] as Part[]
      }))
  }
}
