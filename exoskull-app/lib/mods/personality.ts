/**
 * Per-Mod Personality System
 *
 * Each Mod can have its own personality traits that shape interactions
 */

export interface ModPersonality {
  // Core traits
  tone: 'caring' | 'precise' | 'motivating' | 'analytical' | 'friendly'
  verbosity: 'minimal' | 'balanced' | 'detailed'
  formality: 'casual' | 'professional' | 'adaptive'

  // Behavioral hints
  usesEmoji: boolean
  celebratesWins: boolean
  providesContext: boolean

  // Domain-specific
  expertiseLevel: 'beginner' | 'intermediate' | 'expert'
  defaultLanguage: 'pl' | 'en' | 'adaptive'
}

// Default personalities per Mod type
export const MOD_PERSONALITIES: Record<string, ModPersonality> = {
  // Health Mod - caring and supportive
  health: {
    tone: 'caring',
    verbosity: 'balanced',
    formality: 'casual',
    usesEmoji: false,
    celebratesWins: true,
    providesContext: true,
    expertiseLevel: 'intermediate',
    defaultLanguage: 'adaptive'
  },

  // Finance Mod - precise and analytical
  finance: {
    tone: 'precise',
    verbosity: 'detailed',
    formality: 'professional',
    usesEmoji: false,
    celebratesWins: false,
    providesContext: true,
    expertiseLevel: 'expert',
    defaultLanguage: 'adaptive'
  },

  // Productivity Mod - motivating and action-oriented
  productivity: {
    tone: 'motivating',
    verbosity: 'minimal',
    formality: 'casual',
    usesEmoji: false,
    celebratesWins: true,
    providesContext: false,
    expertiseLevel: 'intermediate',
    defaultLanguage: 'adaptive'
  },

  // Social Mod - friendly and warm
  social: {
    tone: 'friendly',
    verbosity: 'balanced',
    formality: 'casual',
    usesEmoji: false,
    celebratesWins: true,
    providesContext: true,
    expertiseLevel: 'beginner',
    defaultLanguage: 'adaptive'
  },

  // Learning Mod - analytical and detailed
  learning: {
    tone: 'analytical',
    verbosity: 'detailed',
    formality: 'adaptive',
    usesEmoji: false,
    celebratesWins: true,
    providesContext: true,
    expertiseLevel: 'expert',
    defaultLanguage: 'adaptive'
  }
}

/**
 * Get personality prompt for a Mod
 */
export function getModPersonalityPrompt(modType: string): string {
  const personality = MOD_PERSONALITIES[modType]
  if (!personality) {
    return '' // Default: no special personality
  }

  const hints: string[] = []

  // Tone
  switch (personality.tone) {
    case 'caring':
      hints.push('Badz cieplejszy i wspierajacy')
      break
    case 'precise':
      hints.push('Badz dokladny i konkretny')
      break
    case 'motivating':
      hints.push('Badz motywujacy i zachecajacy do dzialania')
      break
    case 'analytical':
      hints.push('Analizuj i wyjasniaj logicznie')
      break
    case 'friendly':
      hints.push('Badz przyjazny i otwarty')
      break
  }

  // Verbosity
  switch (personality.verbosity) {
    case 'minimal':
      hints.push('Odpowiadaj ultra-krotko')
      break
    case 'detailed':
      hints.push('Podawaj szczegoly i kontekst')
      break
  }

  // Celebrations
  if (personality.celebratesWins) {
    hints.push('Celebruj male sukcesy uzytkownika')
  }

  return hints.length > 0
    ? `### Personality (${modType})\n${hints.join('. ')}.`
    : ''
}

/**
 * Merge user preferences with Mod personality
 */
export function mergePersonality(
  modType: string,
  userPreferences?: Partial<ModPersonality>
): ModPersonality {
  const base = MOD_PERSONALITIES[modType] || MOD_PERSONALITIES.productivity
  return { ...base, ...userPreferences }
}
