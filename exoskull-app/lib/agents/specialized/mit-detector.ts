/**
 * MIT Detector Agent
 *
 * Analyzes conversations to identify Most Important Things (objectives 1, 2, 3)
 * Scores by: importance (40%), urgency (30%), impact (30%)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { BaseAgent } from '../core/base-agent'
import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  MIT,
  MITDetectionResult,
  AGENT_TIERS,
} from '../types'

// ============================================================================
// MIT DETECTOR AGENT
// ============================================================================

export class MITDetectorAgent extends BaseAgent {
  readonly id = 'mit-detector'
  readonly name = 'MIT Detector'
  readonly tier: AgentTier = AGENT_TIERS.DEEP // Uses Tier 3 for multi-factor analysis
  readonly capabilities = ['mit_detection', 'goal_analysis', 'priority_ranking']

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

    // Check if we have enough data
    if (resources.availableData.conversations < 5) {
      console.log('[MITDetector] Not enough conversations for analysis')
      return []
    }

    // Check if MIT detection is due
    const hoursSinceLast = environment.lastMitDetection
      ? (Date.now() - new Date(environment.lastMitDetection).getTime()) / (1000 * 60 * 60)
      : Infinity

    if (hoursSinceLast < 24 * 7) {
      // Weekly
      console.log('[MITDetector] MIT detection not due yet')
      return []
    }

    decisions.push({
      action: 'detect_mits',
      confidence: 0.8,
      reasoning: 'Weekly MIT detection based on conversation analysis',
      params: {
        analysisWindow: '30d',
        tenantId: this.context.tenantId,
      },
      urgency: 'background',
      requiredTier: AGENT_TIERS.DEEP,
    })

    return decisions
  }

  // ============================================================================
  // EXECUTION
  // ============================================================================

  async execute(decision: Decision): Promise<ExecutionResult> {
    const startTime = Date.now()

    if (decision.action !== 'detect_mits') {
      return {
        success: false,
        action: decision.action,
        error: `Unknown action: ${decision.action}`,
        metrics: { durationMs: Date.now() - startTime },
      }
    }

    try {
      const result = await this.detectMITs(
        decision.params.tenantId as string,
        decision.params.analysisWindow as string
      )

      await this.logExecution(decision, {
        success: true,
        action: 'detect_mits',
        data: result,
        metrics: {
          durationMs: Date.now() - startTime,
          modelUsed: 'tier-3-deep',
        },
      })

      return {
        success: true,
        action: 'detect_mits',
        data: result,
        metrics: {
          durationMs: Date.now() - startTime,
          modelUsed: 'tier-3-deep',
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logExecution(decision, undefined, errorMessage)

      return {
        success: false,
        action: 'detect_mits',
        error: errorMessage,
        metrics: { durationMs: Date.now() - startTime },
      }
    }
  }

  // ============================================================================
  // MIT DETECTION LOGIC
  // ============================================================================

  private async detectMITs(
    tenantId: string,
    analysisWindow: string
  ): Promise<MITDetectionResult> {
    // 1. Fetch conversations from analysis window
    const windowDays = parseInt(analysisWindow) || 30
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - windowDays)

    const { data: conversations, error } = await this.supabase
      .from('exo_conversations')
      .select('id, context, created_at')
      .eq('tenant_id', tenantId)
      .gt('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`)
    }

    // 2. Extract goal-related statements
    const goalStatements = this.extractGoalStatements(conversations || [])

    // 3. Cluster similar goals
    const clusteredGoals = this.clusterGoals(goalStatements)

    // 4. Score by importance, urgency, impact
    const scoredGoals = this.scoreGoals(clusteredGoals)

    // 5. Get top 3
    const mits: MIT[] = scoredGoals.slice(0, 3).map((goal, index) => ({
      rank: (index + 1) as 1 | 2 | 3,
      objective: goal.objective,
      reasoning: goal.reasoning,
      importance: goal.importance,
      urgency: goal.urgency,
      impact: goal.impact,
      score: goal.score,
      sources: goal.sources,
      lastMentioned: goal.lastMentioned,
    }))

    // 6. Save to database (upsert)
    for (const mit of mits) {
      await this.supabase.from('user_mits').upsert(
        {
          tenant_id: tenantId,
          rank: mit.rank,
          objective: mit.objective,
          reasoning: mit.reasoning,
          importance: mit.importance,
          urgency: mit.urgency,
          impact: mit.impact,
          sources: mit.sources,
          last_mentioned: mit.lastMentioned,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,rank' }
      )
    }

    // 7. Log learning event
    await this.supabase.rpc('log_learning_event', {
      p_tenant_id: tenantId,
      p_event_type: 'mit_updated',
      p_data: { mits: mits.map((m) => ({ rank: m.rank, objective: m.objective })) },
      p_agent_id: this.id,
    })

    return {
      mits,
      analysisWindow,
      conversationsAnalyzed: conversations?.length || 0,
      confidence: Math.min(0.9, (conversations?.length || 0) / 50),
    }
  }

  // ============================================================================
  // EXTRACTION HELPERS
  // ============================================================================

  private extractGoalStatements(
    conversations: Array<{ id: string; context: Record<string, unknown>; created_at: string }>
  ): Array<{ text: string; conversationId: string; timestamp: string }> {
    const statements: Array<{ text: string; conversationId: string; timestamp: string }> = []

    const goalPatterns = [
      // Polish
      /(?:chce|chcialbym|chcialabym|planuje|zamierzam|cel to|moim celem|muszę)\s+([^.!?]{10,150})/gi,
      // English
      /(?:want to|i want|my goal is|i need to|i'm planning to|i should)\s+([^.!?]{10,150})/gi,
      // Expressions of importance
      /(?:najwazniejsze|priorytet|kluczowe|most important|priority)\s*(?:to|jest|is)?\s*([^.!?]{10,150})/gi,
    ]

    for (const conv of conversations) {
      const transcript = this.extractTranscript(conv.context)

      for (const pattern of goalPatterns) {
        const matches = transcript.matchAll(pattern)
        for (const match of matches) {
          const text = match[1]?.trim()
          if (text && text.length > 10) {
            statements.push({
              text,
              conversationId: conv.id,
              timestamp: conv.created_at,
            })
          }
        }
      }
    }

    return statements
  }

  private extractTranscript(context: Record<string, unknown>): string {
    if (typeof context.transcript === 'string') return context.transcript
    if (typeof context.summary === 'string') return context.summary
    if (Array.isArray(context.messages)) {
      return context.messages
        .map((m: { role?: string; content?: string }) => m.content || '')
        .join(' ')
    }
    return ''
  }

  private clusterGoals(
    statements: Array<{ text: string; conversationId: string; timestamp: string }>
  ): Array<{
    objective: string
    sources: string[]
    mentions: number
    lastMentioned: string
  }> {
    const clusters: Map<
      string,
      { objective: string; sources: Set<string>; timestamps: string[] }
    > = new Map()

    for (const stmt of statements) {
      // Simple clustering: normalize and find similar
      const normalized = stmt.text.toLowerCase().replace(/[^\w\s]/g, '')
      let found = false

      for (const [key, cluster] of clusters) {
        // Check for significant word overlap
        const keyWords = key.split(/\s+/).filter((w) => w.length > 3)
        const stmtWords = normalized.split(/\s+/).filter((w) => w.length > 3)
        const overlap = keyWords.filter((w) => stmtWords.includes(w)).length

        if (overlap >= Math.min(3, keyWords.length * 0.5)) {
          cluster.sources.add(stmt.conversationId)
          cluster.timestamps.push(stmt.timestamp)
          found = true
          break
        }
      }

      if (!found) {
        clusters.set(normalized, {
          objective: stmt.text,
          sources: new Set([stmt.conversationId]),
          timestamps: [stmt.timestamp],
        })
      }
    }

    // Convert to array and sort by mentions
    return Array.from(clusters.values())
      .map((c) => ({
        objective: c.objective,
        sources: Array.from(c.sources),
        mentions: c.sources.size,
        lastMentioned: c.timestamps.sort().reverse()[0],
      }))
      .sort((a, b) => b.mentions - a.mentions)
  }

  private scoreGoals(
    clusteredGoals: Array<{
      objective: string
      sources: string[]
      mentions: number
      lastMentioned: string
    }>
  ): Array<{
    objective: string
    reasoning: string
    importance: number
    urgency: number
    impact: number
    score: number
    sources: string[]
    lastMentioned: string
  }> {
    return clusteredGoals.map((goal) => {
      // Score importance based on mentions
      const importance = Math.min(10, Math.round(goal.mentions * 2))

      // Score urgency based on recency
      const daysSinceMention = Math.max(
        0,
        (Date.now() - new Date(goal.lastMentioned).getTime()) / (1000 * 60 * 60 * 24)
      )
      const urgency = Math.max(1, Math.round(10 - daysSinceMention / 3))

      // Impact is harder to determine without more context, use mentions as proxy
      const impact = Math.min(10, Math.round(goal.mentions * 1.5 + 3))

      // Compute weighted score
      const score = importance * 0.4 + urgency * 0.3 + impact * 0.3

      return {
        objective: goal.objective,
        reasoning: `Mentioned ${goal.mentions} times, last ${Math.round(daysSinceMention)} days ago`,
        importance,
        urgency,
        impact,
        score,
        sources: goal.sources,
        lastMentioned: goal.lastMentioned,
      }
    }).sort((a, b) => b.score - a.score)
  }
}
