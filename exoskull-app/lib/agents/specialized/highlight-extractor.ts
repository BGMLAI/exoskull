/**
 * Highlight Extractor Agent
 *
 * Extracts highlights from conversations:
 * - Preferences
 * - Patterns
 * - Goals
 * - Insights
 */

import { BaseAgent } from '../core/base-agent'
import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  HighlightCandidate,
  ExtractionResult,
  AGENT_TIERS,
} from '../types'
import {
  extractPotentialHighlights,
  addHighlight,
  boostHighlight,
  getUserHighlights,
} from '../../memory/highlights'

// ============================================================================
// HIGHLIGHT EXTRACTOR AGENT
// ============================================================================

export class HighlightExtractorAgent extends BaseAgent {
  readonly id = 'highlight-extractor'
  readonly name = 'Highlight Extractor'
  readonly tier: AgentTier = AGENT_TIERS.BALANCED // Tier 2
  readonly capabilities = [
    'highlight_extraction',
    'preference_detection',
    'pattern_detection',
    'goal_detection',
  ]

  constructor(context: AgentContext) {
    super(context)
  }

  // ============================================================================
  // DECISION
  // ============================================================================

  async decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis
  ): Promise<Decision[]> {
    const decisions: Decision[] = []

    // Check if there are unprocessed conversations
    const hoursSinceLast = environment.lastHighlightExtraction
      ? (Date.now() - new Date(environment.lastHighlightExtraction).getTime()) / (1000 * 60 * 60)
      : Infinity

    // Run every 15 minutes if there might be new conversations
    if (hoursSinceLast < 0.25 && environment.lastConversationAgo > 15) {
      console.log('[HighlightExtractor] No new conversations to process')
      return []
    }

    decisions.push({
      action: 'extract_highlights',
      confidence: 0.9,
      reasoning: 'Process unprocessed conversations for highlights',
      params: {
        tenantId: this.context.tenantId,
        batchSize: 50,
      },
      urgency: 'background',
    })

    return decisions
  }

  // ============================================================================
  // EXECUTION
  // ============================================================================

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now()

    if (decision.action !== 'extract_highlights') {
      return {
        success: false,
        action: decision.action,
        error: `Unknown action: ${decision.action}`,
        metrics: { durationMs: Date.now() - startTime },
      }
    }

    try {
      const result = await this.extractHighlights(
        decision.params.tenantId as string,
        decision.params.batchSize as number
      )

      await this.logExecution(decision, {
        success: true,
        action: 'extract_highlights',
        data: result,
        metrics: { durationMs: Date.now() - startTime },
      })

      return {
        success: true,
        action: 'extract_highlights',
        data: result,
        metrics: { durationMs: Date.now() - startTime },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logExecution(decision, undefined, errorMessage)

      return {
        success: false,
        action: 'extract_highlights',
        error: errorMessage,
        metrics: { durationMs: Date.now() - startTime },
      }
    }
  }

  // ============================================================================
  // EXTRACTION LOGIC
  // ============================================================================

  private async extractHighlights(
    tenantId: string,
    batchSize: number
  ): Promise<ExtractionResult> {
    const startTime = Date.now()
    let highlightsAdded = 0
    let highlightsBoosted = 0
    const candidates: HighlightCandidate[] = []

    // 1. Get unprocessed conversations
    const { data: conversations, error } = await this.supabase.rpc(
      'get_unprocessed_conversations',
      {
        p_limit: batchSize,
        p_hours_back: 24,
      }
    )

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`)
    }

    // 2. Get existing highlights for deduplication
    const existingHighlights = await getUserHighlights(this.supabase, tenantId, 100)
    const existingContents = existingHighlights.map((h) => h.content.toLowerCase())

    // 3. Process each conversation
    for (const conv of conversations || []) {
      const transcript = this.extractTranscript(conv.context)
      if (!transcript || transcript.length < 50) {
        await this.markProcessed(conv.id, 0)
        continue
      }

      // Extract candidates using regex patterns
      const rawCandidates = extractPotentialHighlights(
        transcript,
        existingHighlights.map((h) => h.content)
      )

      // Validate and add
      for (const candidate of rawCandidates.slice(0, 5)) {
        // Skip if too similar to existing
        const isDuplicate = existingContents.some((existing) =>
          this.isSimilar(candidate.content.toLowerCase(), existing)
        )

        if (!isDuplicate && candidate.importance >= 5) {
          const result = await addHighlight(this.supabase, tenantId, {
            category: candidate.category,
            content: candidate.content,
            importance: candidate.importance,
            source: 'conversation',
          })

          if (result) {
            highlightsAdded++
            candidates.push({
              ...candidate,
              conversationId: conv.id,
              source: 'conversation',
              confidence: 0.7,
            })

            // Log event
            await this.logLearningEvent('highlight_added', tenantId, {
              content: candidate.content,
              category: candidate.category,
              conversationId: conv.id,
            })
          }
        }
      }

      // Check for references to existing highlights and boost
      for (const existing of existingHighlights) {
        if (this.isReferenced(transcript, existing.content)) {
          await boostHighlight(this.supabase, existing.id)
          highlightsBoosted++

          await this.logLearningEvent('highlight_boosted', tenantId, {
            highlightId: existing.id,
            content: existing.content,
            conversationId: conv.id,
          })
        }
      }

      // Mark as processed
      await this.markProcessed(conv.id, highlightsAdded)
    }

    return {
      candidates,
      highlightsAdded,
      highlightsBoosted,
      processingTimeMs: Date.now() - startTime,
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private extractTranscript(context: Record<string, unknown>): string {
    if (typeof context.transcript === 'string') return context.transcript
    if (typeof context.summary === 'string') return context.summary
    if (Array.isArray(context.messages)) {
      return context.messages
        .map((m: { content?: string }) => m.content || '')
        .join(' ')
    }
    return ''
  }

  private isSimilar(a: string, b: string): boolean {
    // Simple word overlap check
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3))
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3))

    let overlap = 0
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++
    }

    const similarity = overlap / Math.max(wordsA.size, wordsB.size)
    return similarity > 0.6
  }

  private isReferenced(transcript: string, content: string): boolean {
    const lowerTranscript = transcript.toLowerCase()
    const contentWords = content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)

    const matchingWords = contentWords.filter((word) =>
      lowerTranscript.includes(word)
    )

    return matchingWords.length >= Math.min(3, contentWords.length)
  }

  private async markProcessed(
    conversationId: string,
    highlightsCount: number
  ): Promise<void> {
    await this.supabase.rpc('mark_conversation_processed', {
      p_conversation_id: conversationId,
      p_highlights_count: highlightsCount,
    })
  }

  private async logLearningEvent(
    type: string,
    tenantId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.rpc('log_learning_event', {
      p_tenant_id: tenantId,
      p_event_type: type,
      p_data: data,
      p_agent_id: this.id,
    })
  }
}
