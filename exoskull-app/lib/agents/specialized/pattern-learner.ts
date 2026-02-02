/**
 * Pattern Learner Agent
 *
 * Detects behavioral patterns from user data:
 * - Sleep patterns
 * - Productivity cycles
 * - Social habits
 * - Spending patterns
 *
 * Suggests automations based on detected patterns.
 */

import { BaseAgent } from '../core/base-agent'
import {
  AgentTier,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  DetectedPattern,
  PatternLearningResult,
  AGENT_TIERS,
} from '../types'

// ============================================================================
// PATTERN LEARNER AGENT
// ============================================================================

export class PatternLearnerAgent extends BaseAgent {
  readonly id = 'pattern-learner'
  readonly name = 'Pattern Learner'
  readonly tier: AgentTier = AGENT_TIERS.DEEP // Tier 3 for complex analysis
  readonly capabilities = [
    'pattern_detection',
    'behavior_analysis',
    'automation_suggestion',
    'trend_detection',
  ]

  constructor(context: AgentContext) {
    super(context)
  }

  // ============================================================================
  // DECISION
  // ============================================================================

  async decide(
    resources: ResourceAnalysis,
    _environment: EnvironmentAnalysis
  ): Promise<Decision[]> {
    const decisions: Decision[] = []

    // Need sufficient data for pattern detection
    if (resources.availableData.conversations < 20) {
      console.log('[PatternLearner] Insufficient data for pattern analysis')
      return []
    }

    decisions.push({
      action: 'detect_patterns',
      confidence: 0.75,
      reasoning: 'Weekly pattern analysis based on accumulated data',
      params: {
        tenantId: this.context.tenantId,
        analysisWindow: '30d',
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

    if (decision.action !== 'detect_patterns') {
      return {
        success: false,
        action: decision.action,
        error: `Unknown action: ${decision.action}`,
        metrics: { durationMs: Date.now() - startTime },
      }
    }

    try {
      const result = await this.detectPatterns(
        decision.params.tenantId as string,
        decision.params.analysisWindow as string
      )

      await this.logExecution(decision, {
        success: true,
        action: 'detect_patterns',
        data: result,
        metrics: {
          durationMs: Date.now() - startTime,
          modelUsed: 'tier-3-deep',
        },
      })

      return {
        success: true,
        action: 'detect_patterns',
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
        action: 'detect_patterns',
        error: errorMessage,
        metrics: { durationMs: Date.now() - startTime },
      }
    }
  }

  // ============================================================================
  // PATTERN DETECTION LOGIC
  // ============================================================================

  private async detectPatterns(
    tenantId: string,
    analysisWindow: string
  ): Promise<PatternLearningResult> {
    const windowDays = parseInt(analysisWindow) || 30
    const patterns: DetectedPattern[] = []
    let newPatterns = 0
    let updatedPatterns = 0

    // 1. Analyze conversation timing patterns
    const timingPatterns = await this.analyzeConversationTiming(tenantId, windowDays)
    patterns.push(...timingPatterns)

    // 2. Analyze topic patterns
    const topicPatterns = await this.analyzeTopicPatterns(tenantId, windowDays)
    patterns.push(...topicPatterns)

    // 3. Get existing patterns to compare
    const { data: existingPatterns } = await this.supabase
      .from('user_patterns')
      .select('*')
      .eq('tenant_id', tenantId)

    // 4. Save/update patterns
    for (const pattern of patterns) {
      const existing = existingPatterns?.find(
        (p) =>
          p.pattern_type === pattern.type &&
          this.isSimilarDescription(p.description, pattern.description)
      )

      if (existing) {
        // Update existing pattern
        await this.supabase
          .from('user_patterns')
          .update({
            confidence: Math.min(1, (existing.confidence + pattern.confidence) / 2 + 0.1),
            data_points: existing.data_points + pattern.dataPoints,
            suggested_automation: pattern.suggestedAutomation,
            last_detected: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        updatedPatterns++
      } else {
        // Insert new pattern
        await this.supabase.from('user_patterns').insert({
          tenant_id: tenantId,
          pattern_type: pattern.type,
          description: pattern.description,
          frequency: pattern.frequency,
          confidence: pattern.confidence,
          data_points: pattern.dataPoints,
          suggested_automation: pattern.suggestedAutomation,
          last_detected: new Date().toISOString(),
        })
        newPatterns++

        // Log learning event
        await this.logLearningEvent('pattern_detected', tenantId, {
          type: pattern.type,
          description: pattern.description,
          confidence: pattern.confidence,
        })
      }
    }

    return {
      patterns,
      newPatterns,
      updatedPatterns,
      analysisWindow,
    }
  }

  // ============================================================================
  // ANALYSIS METHODS
  // ============================================================================

  private async analyzeConversationTiming(
    tenantId: string,
    windowDays: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = []
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - windowDays)

    // Get conversation timestamps
    const { data: conversations } = await this.supabase
      .from('exo_conversations')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .gt('created_at', cutoff.toISOString())

    if (!conversations || conversations.length < 10) {
      return patterns
    }

    // Analyze hour distribution
    const hourCounts: Record<number, number> = {}
    const dayOfWeekCounts: Record<number, number> = {}

    for (const conv of conversations) {
      const date = new Date(conv.created_at)
      const hour = date.getHours()
      const dayOfWeek = date.getDay()

      hourCounts[hour] = (hourCounts[hour] || 0) + 1
      dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1
    }

    // Find peak hours
    const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])
    if (sortedHours.length > 0) {
      const peakHour = parseInt(sortedHours[0][0])
      const peakCount = sortedHours[0][1]
      const avgCount = conversations.length / 24

      if (peakCount > avgCount * 2) {
        patterns.push({
          type: 'productivity',
          description: `Most active around ${peakHour}:00`,
          frequency: 'daily',
          confidence: Math.min(0.9, peakCount / conversations.length),
          dataPoints: conversations.length,
          suggestedAutomation: `Schedule important check-ins around ${peakHour}:00`,
        })
      }
    }

    // Find weekday vs weekend pattern
    const weekdayCount = [1, 2, 3, 4, 5].reduce(
      (sum, day) => sum + (dayOfWeekCounts[day] || 0),
      0
    )
    const weekendCount = [0, 6].reduce(
      (sum, day) => sum + (dayOfWeekCounts[day] || 0),
      0
    )

    if (weekdayCount > weekendCount * 3) {
      patterns.push({
        type: 'productivity',
        description: 'Primarily active on weekdays',
        frequency: 'weekly',
        confidence: 0.8,
        dataPoints: conversations.length,
        suggestedAutomation: 'Reduce notifications on weekends',
      })
    } else if (weekendCount > weekdayCount * 0.5) {
      patterns.push({
        type: 'productivity',
        description: 'Active on weekends as well',
        frequency: 'weekly',
        confidence: 0.7,
        dataPoints: conversations.length,
      })
    }

    return patterns
  }

  private async analyzeTopicPatterns(
    tenantId: string,
    windowDays: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = []
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - windowDays)

    // Get conversation topics/keywords
    const { data: highlights } = await this.supabase
      .from('user_memory_highlights')
      .select('category, content')
      .eq('user_id', tenantId)
      .gt('created_at', cutoff.toISOString())

    if (!highlights || highlights.length < 5) {
      return patterns
    }

    // Count categories
    const categoryCounts: Record<string, number> = {}
    for (const h of highlights) {
      categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1
    }

    // Identify dominant themes
    const sortedCategories = Object.entries(categoryCounts).sort(
      (a, b) => b[1] - a[1]
    )

    if (sortedCategories.length > 0) {
      const [topCategory, count] = sortedCategories[0]

      if (count >= 3) {
        const categoryDescriptions: Record<string, string> = {
          preference: 'Frequently expresses preferences',
          goal: 'Goal-oriented conversations',
          pattern: 'Routine-based discussions',
          insight: 'Reflective conversations',
          relationship: 'Focus on relationships',
        }

        patterns.push({
          type: this.mapCategoryToPatternType(topCategory),
          description: categoryDescriptions[topCategory] || `Focus on ${topCategory}`,
          frequency: 'irregular',
          confidence: Math.min(0.85, count / highlights.length),
          dataPoints: count,
        })
      }
    }

    return patterns
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapCategoryToPatternType(
    category: string
  ): 'sleep' | 'productivity' | 'social' | 'health' | 'finance' | 'custom' {
    const mapping: Record<string, DetectedPattern['type']> = {
      preference: 'custom',
      goal: 'productivity',
      pattern: 'productivity',
      insight: 'custom',
      relationship: 'social',
    }
    return mapping[category] || 'custom'
  }

  private isSimilarDescription(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\s+/))
    const wordsB = new Set(b.toLowerCase().split(/\s+/))

    let overlap = 0
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++
    }

    return overlap >= Math.min(wordsA.size, wordsB.size) * 0.5
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
