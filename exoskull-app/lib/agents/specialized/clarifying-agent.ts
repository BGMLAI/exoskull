/**
 * Clarifying Agent
 *
 * Sees the ESSENCE of a situation, separating facts from emotions.
 * Used before major decisions to ensure clarity.
 */

import { BaseAgent } from '../core/base-agent'
import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  ClarifiedEssence,
  AGENT_TIERS,
} from '../types'

// ============================================================================
// CLARIFYING AGENT
// ============================================================================

export class ClarifyingAgent extends BaseAgent {
  readonly id = 'clarifying-agent'
  readonly name = 'Clarifying Agent'
  readonly tier: AgentTier = AGENT_TIERS.BALANCED // Tier 2 - good at distillation
  readonly capabilities = [
    'clarification',
    'essence_extraction',
    'emotion_separation',
    'decision_support',
  ]

  constructor(context: AgentContext) {
    super(context)
  }

  // ============================================================================
  // DECISION
  // ============================================================================

  async decide(
    _resources: ResourceAnalysis,
    _environment: EnvironmentAnalysis
  ): Promise<Decision[]> {
    // Clarifying agent is typically invoked directly with input
    // It doesn't make autonomous decisions
    return []
  }

  // ============================================================================
  // EXECUTION
  // ============================================================================

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now()

    if (decision.action !== 'clarify') {
      return {
        success: false,
        action: decision.action,
        error: `Unknown action: ${decision.action}`,
        metrics: { durationMs: Date.now() - startTime },
      }
    }

    try {
      const input = decision.params.input as string
      const context = decision.params.context as Record<string, unknown> | undefined

      const result = await this.clarify(input, context)

      await this.logExecution(decision, {
        success: true,
        action: 'clarify',
        data: result,
        metrics: {
          durationMs: Date.now() - startTime,
          modelUsed: 'tier-2-balanced',
        },
      })

      return {
        success: true,
        action: 'clarify',
        data: result,
        metrics: {
          durationMs: Date.now() - startTime,
          modelUsed: 'tier-2-balanced',
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        action: 'clarify',
        error: errorMessage,
        metrics: { durationMs: Date.now() - startTime },
      }
    }
  }

  // ============================================================================
  // CLARIFICATION LOGIC
  // ============================================================================

  /**
   * Clarify an input, extracting essence from emotions
   */
  async clarify(
    input: string,
    _context?: Record<string, unknown>
  ): Promise<ClarifiedEssence> {
    // Step 1: Detect emotions
    const emotions = this.detectEmotions(input)

    // Step 2: Extract facts
    const facts = this.extractFacts(input)

    // Step 3: Identify core question/situation
    const coreQuestion = this.identifyCoreQuestion(input)
    const actualSituation = this.describeActualSituation(input, facts)

    // Step 4: Suggest actions
    const suggestedActions = this.suggestActions(facts, coreQuestion)

    // Step 5: Calculate confidence
    const confidence = this.calculateConfidence(input, facts, emotions)

    return {
      facts,
      actualSituation,
      coreQuestion,
      emotionsDetected: emotions,
      suggestedActions,
      confidence,
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private detectEmotions(input: string): string[] {
    const emotions: string[] = []
    const lowerInput = input.toLowerCase()

    const emotionPatterns: Array<{ pattern: RegExp; emotion: string }> = [
      // Anger
      { pattern: /wkurza|zly|wsciekly|denerwuje|irytuje|angry|frustrated|pissed/i, emotion: 'anger' },
      // Fear
      { pattern: /boje|strach|lekam|niepewny|afraid|scared|worried|anxious/i, emotion: 'fear' },
      // Sadness
      { pattern: /smutny|przygnebiony|sad|depressed|down|unhappy/i, emotion: 'sadness' },
      // Confusion
      { pattern: /nie wiem|zagu biony|nie rozumiem|confused|lost|uncertain/i, emotion: 'confusion' },
      // Stress
      { pattern: /stres|przytloczony|za duzo|overwhelmed|stressed|pressure/i, emotion: 'stress' },
      // Excitement
      { pattern: /podekscytowany|nie moge sie doczekac|excited|thrilled|can't wait/i, emotion: 'excitement' },
      // Frustration
      { pattern: /nie dziala|znowu|kurwa|nie moge|doesnt work|again|cant/i, emotion: 'frustration' },
    ]

    for (const { pattern, emotion } of emotionPatterns) {
      if (pattern.test(lowerInput)) {
        emotions.push(emotion)
      }
    }

    return [...new Set(emotions)]
  }

  private extractFacts(input: string): string[] {
    const facts: string[] = []
    const sentences = input.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    for (const sentence of sentences) {
      const trimmed = sentence.trim()

      // Skip clearly emotional expressions
      if (/^(kurwa|nie moge|za duzo|cholera|damn|fuck|shit)/i.test(trimmed)) {
        continue
      }

      // Look for factual patterns
      const factPatterns = [
        /(\w+) jest (\w+)/i, // X is Y
        /mam (\d+)/i, // I have N
        /(\d+) (dni|tygodni|godzin)/i, // N days/weeks/hours
        /od (\w+)/i, // since X
        /do (\w+)/i, // until X
        /(\w+) nie dziala/i, // X doesn't work
        /potrzebuje (\w+)/i, // I need X
      ]

      for (const pattern of factPatterns) {
        if (pattern.test(trimmed)) {
          // Clean and add the fact
          const cleanedFact = this.cleanFact(trimmed)
          if (cleanedFact.length > 5 && cleanedFact.length < 200) {
            facts.push(cleanedFact)
          }
          break
        }
      }
    }

    return facts.slice(0, 5) // Max 5 facts
  }

  private cleanFact(text: string): string {
    return text
      .replace(/^(kurwa|cholera|no|wiec|i|ale|hej)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private identifyCoreQuestion(input: string): string {
    // Look for explicit questions
    const questionMatch = input.match(/(?:co|jak|dlaczego|kiedy|czy|where|what|how|why|when|should)\s+[^.!?]+\?/i)
    if (questionMatch) {
      return questionMatch[0].trim()
    }

    // Look for implicit questions/needs
    const needPatterns = [
      { pattern: /nie wiem (co|jak|czy)/i, question: 'What should I do?' },
      { pattern: /potrzebuje (pomocy|rady)/i, question: 'What advice do you need?' },
      { pattern: /co mam (zrobic|robic)/i, question: 'What action to take?' },
      { pattern: /jak (to|mam)/i, question: 'How to proceed?' },
    ]

    for (const { pattern, question } of needPatterns) {
      if (pattern.test(input)) {
        return question
      }
    }

    return 'What is the actual problem or goal?'
  }

  private describeActualSituation(input: string, facts: string[]): string {
    if (facts.length === 0) {
      return 'Situation unclear - more concrete information needed.'
    }

    // Build a simple description from facts
    const factSummary = facts.slice(0, 3).join('. ')

    // Check for problem vs goal
    const isProblem = /problem|nie dziala|zly|error|fail|broken/i.test(input)
    const isGoal = /chce|planuje|cel|want|goal|plan/i.test(input)

    if (isProblem) {
      return `Problem: ${factSummary}`
    } else if (isGoal) {
      return `Goal: ${factSummary}`
    }

    return `Situation: ${factSummary}`
  }

  private suggestActions(facts: string[], coreQuestion: string): string[] {
    const actions: string[] = []

    // Generic helpful actions
    if (facts.length < 2) {
      actions.push('Gather more specific information')
    }

    if (/what should|co mam/i.test(coreQuestion)) {
      actions.push('List concrete options available')
      actions.push('Evaluate pros and cons of each option')
    }

    if (/how|jak/i.test(coreQuestion)) {
      actions.push('Break down into smaller steps')
      actions.push('Identify the first concrete action')
    }

    // Add a default if empty
    if (actions.length === 0) {
      actions.push('Clarify the specific outcome you want')
      actions.push('Identify immediate next step')
    }

    return actions.slice(0, 3)
  }

  private calculateConfidence(
    input: string,
    facts: string[],
    emotions: string[]
  ): number {
    let confidence = 0.5

    // More facts = higher confidence
    confidence += facts.length * 0.1

    // Clear question = higher confidence
    if (input.includes('?')) {
      confidence += 0.1
    }

    // Too emotional = lower confidence in analysis
    if (emotions.length > 2) {
      confidence -= 0.1
    }

    // Very short input = lower confidence
    if (input.length < 50) {
      confidence -= 0.1
    }

    return Math.max(0.2, Math.min(0.95, confidence))
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Quick clarify without full agent lifecycle
 */
export async function clarifyInput(
  input: string,
  tenantId: string
): Promise<ClarifiedEssence> {
  const { createAgentContext } = await import('../core/agent-context')
  const context = createAgentContext(tenantId)
  const agent = new ClarifyingAgent(context)
  return agent.clarify(input)
}
