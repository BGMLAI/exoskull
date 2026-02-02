/**
 * Memory Highlights System
 *
 * Auto-generated user highlights for fast context loading
 * (Like OpenClaw's MEMORY.md but stored in DB)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface UserHighlight {
  id: string
  user_id: string
  category: 'preference' | 'pattern' | 'goal' | 'insight' | 'relationship'
  content: string
  importance: number // 1-10
  source: 'conversation' | 'analysis' | 'explicit'
  created_at: string
  updated_at: string
  expires_at?: string
}

export interface HighlightsSummary {
  preferences: string[]
  patterns: string[]
  goals: string[]
  insights: string[]
  relationships: string[]
}

/**
 * Get top highlights for a user (for fast context loading)
 */
export async function getUserHighlights(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<UserHighlight[]> {
  const { data, error } = await supabase
    .from('user_memory_highlights')
    .select('*')
    .eq('user_id', userId)
    .or('expires_at.is.null,expires_at.gt.now()')
    .order('importance', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Highlights] Failed to fetch:', error)
    return []
  }

  return data || []
}

/**
 * Format highlights as context string for system prompt
 */
export function formatHighlightsForPrompt(highlights: UserHighlight[]): string {
  if (highlights.length === 0) {
    return ''
  }

  const grouped = highlights.reduce((acc, h) => {
    if (!acc[h.category]) acc[h.category] = []
    acc[h.category].push(h.content)
    return acc
  }, {} as Record<string, string[]>)

  const sections: string[] = []

  if (grouped.preference?.length) {
    sections.push(`Preferencje: ${grouped.preference.slice(0, 5).join('; ')}`)
  }
  if (grouped.pattern?.length) {
    sections.push(`Wzorce: ${grouped.pattern.slice(0, 3).join('; ')}`)
  }
  if (grouped.goal?.length) {
    sections.push(`Cele: ${grouped.goal.slice(0, 3).join('; ')}`)
  }
  if (grouped.insight?.length) {
    sections.push(`Insights: ${grouped.insight.slice(0, 3).join('; ')}`)
  }

  return sections.length > 0
    ? `### Pamiec o uzytkowniku\n${sections.join('\n')}`
    : ''
}

/**
 * Add a new highlight
 */
export async function addHighlight(
  supabase: SupabaseClient,
  userId: string,
  highlight: Omit<UserHighlight, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<UserHighlight | null> {
  const { data, error } = await supabase
    .from('user_memory_highlights')
    .insert({
      user_id: userId,
      ...highlight
    })
    .select()
    .single()

  if (error) {
    console.error('[Highlights] Failed to add:', error)
    return null
  }

  return data
}

/**
 * Update highlight importance (e.g., when referenced again)
 */
export async function boostHighlight(
  supabase: SupabaseClient,
  highlightId: string
): Promise<void> {
  await supabase
    .from('user_memory_highlights')
    .update({
      importance: supabase.rpc('least', { a: 10, b: supabase.raw('importance + 1') }),
      updated_at: new Date().toISOString()
    })
    .eq('id', highlightId)
}

/**
 * Extract potential highlights from conversation
 */
export function extractPotentialHighlights(
  conversation: string,
  existingHighlights: string[]
): Array<{ category: UserHighlight['category']; content: string; importance: number }> {
  const potential: Array<{ category: UserHighlight['category']; content: string; importance: number }> = []

  // Pattern: "I prefer X" or "I like X"
  const preferencePatterns = [
    /(?:prefer|lubie|wole)\s+(.{5,50})/gi,
    /(?:always|zawsze)\s+(.{5,50})/gi,
  ]

  for (const pattern of preferencePatterns) {
    const matches = conversation.matchAll(pattern)
    for (const match of matches) {
      const content = match[1].trim()
      if (!existingHighlights.some(h => h.toLowerCase().includes(content.toLowerCase()))) {
        potential.push({
          category: 'preference',
          content,
          importance: 5
        })
      }
    }
  }

  // Pattern: Goals
  const goalPatterns = [
    /(?:chce|want to|goal is|cel to)\s+(.{5,100})/gi,
    /(?:planuje|planning to)\s+(.{5,100})/gi,
  ]

  for (const pattern of goalPatterns) {
    const matches = conversation.matchAll(pattern)
    for (const match of matches) {
      const content = match[1].trim()
      if (!existingHighlights.some(h => h.toLowerCase().includes(content.toLowerCase()))) {
        potential.push({
          category: 'goal',
          content,
          importance: 7
        })
      }
    }
  }

  return potential
}

/**
 * Migration helper - create highlights table if not exists
 */
export const HIGHLIGHTS_MIGRATION = `
CREATE TABLE IF NOT EXISTS user_memory_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('preference', 'pattern', 'goal', 'insight', 'relationship')),
  content TEXT NOT NULL,
  importance INT NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  source TEXT NOT NULL DEFAULT 'conversation' CHECK (source IN ('conversation', 'analysis', 'explicit')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(user_id, category, content)
);

CREATE INDEX IF NOT EXISTS idx_highlights_user ON user_memory_highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_importance ON user_memory_highlights(user_id, importance DESC);

ALTER TABLE user_memory_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own highlights"
  ON user_memory_highlights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own highlights"
  ON user_memory_highlights FOR ALL
  USING (auth.uid() = user_id);
`
