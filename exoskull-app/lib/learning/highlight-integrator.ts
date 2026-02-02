/**
 * Highlight Integrator
 *
 * Loads and formats highlights for voice system integration.
 * Bridges memory/highlights.ts with voice/system-prompt.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getUserHighlights, UserHighlight } from '../memory/highlights'
import { UserHighlightSummary } from '../voice/system-prompt'

// ============================================================================
// HIGHLIGHT LOADING
// ============================================================================

/**
 * Load highlights for a user and format for system prompt
 */
export async function loadHighlightsForPrompt(
  tenantId: string,
  supabaseClient?: SupabaseClient
): Promise<UserHighlightSummary> {
  const supabase =
    supabaseClient ||
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

  try {
    const highlights = await getUserHighlights(supabase, tenantId, 20)
    return groupHighlights(highlights)
  } catch (error) {
    console.error('[HighlightIntegrator] Failed to load highlights:', error)
    return {
      preferences: [],
      patterns: [],
      goals: [],
      insights: [],
    }
  }
}

/**
 * Group highlights by category
 */
function groupHighlights(highlights: UserHighlight[]): UserHighlightSummary {
  const grouped: UserHighlightSummary = {
    preferences: [],
    patterns: [],
    goals: [],
    insights: [],
  }

  for (const h of highlights) {
    switch (h.category) {
      case 'preference':
        grouped.preferences.push(h.content)
        break
      case 'pattern':
        grouped.patterns.push(h.content)
        break
      case 'goal':
        grouped.goals.push(h.content)
        break
      case 'insight':
        grouped.insights.push(h.content)
        break
      // 'relationship' is excluded from voice prompt for brevity
    }
  }

  return grouped
}

// ============================================================================
// MIT LOADING
// ============================================================================

export interface MIT {
  rank: number
  objective: string
}

/**
 * Load MITs for a user
 */
export async function loadMITsForPrompt(
  tenantId: string,
  supabaseClient?: SupabaseClient
): Promise<MIT[]> {
  const supabase =
    supabaseClient ||
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

  try {
    const { data, error } = await supabase.rpc('get_user_mits', {
      p_tenant_id: tenantId,
    })

    if (error) {
      console.error('[HighlightIntegrator] Failed to load MITs:', error)
      return []
    }

    return (data || []).map((m: { rank: number; objective: string }) => ({
      rank: m.rank,
      objective: m.objective,
    }))
  } catch (error) {
    console.error('[HighlightIntegrator] Error loading MITs:', error)
    return []
  }
}

// ============================================================================
// COMBINED CONTEXT LOADER
// ============================================================================

export interface MemoryContext {
  highlights: UserHighlightSummary
  mits: MIT[]
}

/**
 * Load all memory context for voice prompt
 * Call this before building system prompt
 */
export async function loadMemoryContext(
  tenantId: string,
  supabaseClient?: SupabaseClient
): Promise<MemoryContext> {
  const [highlights, mits] = await Promise.all([
    loadHighlightsForPrompt(tenantId, supabaseClient),
    loadMITsForPrompt(tenantId, supabaseClient),
  ])

  return { highlights, mits }
}

// ============================================================================
// CONVENIENCE FUNCTION FOR VAPI WEBHOOK
// ============================================================================

/**
 * Get memory context as variable values for VAPI
 */
export async function getMemoryVariables(
  tenantId: string
): Promise<Record<string, string>> {
  const { highlights, mits } = await loadMemoryContext(tenantId)

  const variables: Record<string, string> = {}

  // Format highlights
  if (highlights.preferences.length > 0) {
    variables.user_preferences = highlights.preferences.slice(0, 3).join(', ')
  }
  if (highlights.goals.length > 0) {
    variables.user_goals = highlights.goals.slice(0, 3).join(', ')
  }

  // Format MITs
  if (mits.length > 0) {
    variables.user_mits = mits.map((m) => `${m.rank}. ${m.objective}`).join(' | ')
  }

  return variables
}
