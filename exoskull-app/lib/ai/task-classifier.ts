/**
 * Task Classifier
 *
 * Analyzes incoming requests and determines:
 * - Task complexity
 * - Task category
 * - Suggested tier
 *
 * Uses heuristics (keywords, message length, tools) for fast classification.
 * No AI call needed - classification must be instant.
 */

import {
  AIRequestOptions,
  TaskComplexity,
  TaskCategory,
  TaskClassification,
  ModelTier
} from './types'
import { CLASSIFICATION_KEYWORDS, getTierForCategory } from './config'

/**
 * Classify a task based on request options
 */
export function classifyTask(options: AIRequestOptions): TaskClassification {
  // 1. Check explicit hints first
  if (options.taskCategory) {
    const tier = options.forceTier ?? getTierForCategory(options.taskCategory)
    return {
      complexity: getCategoryComplexity(options.taskCategory),
      category: options.taskCategory,
      suggestedTier: tier,
      confidence: 1.0,
      reasoning: 'Explicit task category provided'
    }
  }

  // 2. Analyze message content
  const systemPrompt = options.messages.find(m => m.role === 'system')?.content || ''
  const userMessage = options.messages.find(m => m.role === 'user')?.content || ''
  const allText = `${systemPrompt} ${userMessage}`.toLowerCase()
  const totalLength = systemPrompt.length + userMessage.length
  const hasTools = (options.tools?.length || 0) > 0
  const toolCount = options.tools?.length || 0

  // 3. Check for Tier 4 (crisis/meta) keywords first - highest priority
  if (containsKeywords(allText, CLASSIFICATION_KEYWORDS.tier4_crisis)) {
    return {
      complexity: 'critical',
      category: 'crisis',
      suggestedTier: 4,
      confidence: 0.9,
      reasoning: 'Crisis keywords detected'
    }
  }

  if (containsKeywords(allText, CLASSIFICATION_KEYWORDS.tier4_meta)) {
    return {
      complexity: 'complex',
      category: 'meta_coordination',
      suggestedTier: 4,
      confidence: 0.8,
      reasoning: 'Meta/strategic keywords detected'
    }
  }

  // 4. Check for Tier 1 (simple) patterns
  if (totalLength < 500 && !hasTools) {
    if (containsKeywords(allText, CLASSIFICATION_KEYWORDS.tier1)) {
      // Determine specific category
      if (allText.includes('yes') || allText.includes('no') ||
          allText.includes('tak') || allText.includes('nie') ||
          allText.includes('classify') || allText.includes('wybierz')) {
        return {
          complexity: 'trivial',
          category: 'classification',
          suggestedTier: 1,
          confidence: 0.85,
          reasoning: 'Simple classification task'
        }
      }

      if (allText.includes('greeting') || allText.includes('hello') ||
          allText.includes('cześć') || allText.includes('pozdrow')) {
        return {
          complexity: 'trivial',
          category: 'simple_response',
          suggestedTier: 1,
          confidence: 0.9,
          reasoning: 'Simple greeting/response'
        }
      }

      if (allText.includes('extract') || allText.includes('parse')) {
        return {
          complexity: 'simple',
          category: 'extraction',
          suggestedTier: 1,
          confidence: 0.8,
          reasoning: 'Data extraction task'
        }
      }
    }
  }

  // 5. Check for Tier 3 (complex reasoning)
  if (totalLength > 10000 || (hasTools && toolCount > 3)) {
    return {
      complexity: 'complex',
      category: 'reasoning',
      suggestedTier: 3,
      confidence: 0.7,
      reasoning: 'Long context or many tools indicates complex reasoning'
    }
  }

  // 6. Check for summarization patterns (Tier 2)
  if (allText.includes('summar') || allText.includes('streszcz') ||
      allText.includes('podsumuj') || allText.includes('pattern')) {
    return {
      complexity: 'moderate',
      category: 'summarization',
      suggestedTier: 2,
      confidence: 0.75,
      reasoning: 'Summarization/pattern task'
    }
  }

  // 7. Default to Tier 2 (moderate) for uncertain cases
  // This is safer than Tier 1 (avoids quality issues) and cheaper than Tier 3/4
  return {
    complexity: 'moderate',
    category: 'analysis',
    suggestedTier: 2,
    confidence: 0.5,
    reasoning: 'Default to Tier 2 for uncertain complexity'
  }
}

/**
 * Get complexity level for a category
 */
function getCategoryComplexity(category: TaskCategory): TaskComplexity {
  switch (category) {
    case 'classification':
    case 'extraction':
    case 'simple_response':
      return 'trivial'
    case 'summarization':
    case 'analysis':
      return 'moderate'
    case 'reasoning':
    case 'swarm':
      return 'complex'
    case 'meta_coordination':
    case 'crisis':
      return 'critical'
    default:
      return 'moderate'
  }
}

/**
 * Check if text contains any of the keywords
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()))
}

/**
 * Estimate token count (rough heuristic)
 * ~4 characters per token for English, ~3 for Polish
 */
export function estimateTokenCount(text: string): number {
  // Check if text is primarily Polish (contains Polish diacritics)
  const polishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
  const charsPerToken = polishChars.test(text) ? 3 : 4
  return Math.ceil(text.length / charsPerToken)
}
