/**
 * Multi-Model AI Router - Main Export
 *
 * Usage:
 *
 * ```typescript
 * import { aiChat, getAIRouter } from '@/lib/ai'
 *
 * // Simple usage - auto-routes based on task complexity
 * const response = await aiChat([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ])
 *
 * // With explicit category hint
 * const greeting = await aiChat(
 *   [{ role: 'user', content: 'Say hello' }],
 *   { taskCategory: 'simple_response' } // Routes to Tier 1 (Gemini Flash)
 * )
 *
 * // Force specific tier
 * const analysis = await aiChat(
 *   [{ role: 'user', content: 'Analyze this complex data...' }],
 *   { forceTier: 3 } // Routes to Tier 3 (Codex 5.2)
 * )
 *
 * // Force specific model
 * const critical = await aiChat(
 *   [{ role: 'user', content: 'Handle this crisis...' }],
 *   { forceModel: 'claude-opus-4-6' }
 * )
 *
 * // Access router directly for status/debugging
 * const router = getAIRouter()
 * const status = await router.getProviderStatus()
 * ```
 */

import { getModelRouter } from "./model-router";
import { AIMessage, AIRequestOptions, AIResponse } from "./types";

// Re-export types
export * from "./types";

/**
 * Convenience function for simple chat requests
 *
 * @param messages - Array of messages (system, user, assistant)
 * @param options - Optional routing hints and metadata
 * @returns AI response with content, usage, and metadata
 */
export async function aiChat(
  messages: AIMessage[],
  options?: Partial<Omit<AIRequestOptions, "messages">>,
): Promise<AIResponse> {
  const router = getModelRouter();
  return router.route({
    messages,
    ...options,
  });
}

/**
 * Convenience function for simple text completion
 *
 * @param prompt - User prompt
 * @param systemPrompt - Optional system prompt
 * @param options - Optional routing hints
 * @returns Response content as string
 */
async function aiComplete(
  prompt: string,
  systemPrompt?: string,
  options?: Partial<Omit<AIRequestOptions, "messages">>,
): Promise<string> {
  const messages: AIMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const response = await aiChat(messages, options);
  return response.content;
}

/**
 * Quick, cheap completion (Tier 1 - Gemini 3 Flash)
 * Best for: Classification, extraction, simple responses
 */
export async function aiQuick(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  return aiComplete(prompt, systemPrompt, { forceTier: 1 });
}
