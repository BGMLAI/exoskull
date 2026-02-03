/**
 * Adaptive Color Palettes
 *
 * 5 mood-based palettes that change the UI atmosphere.
 * Uses CSS custom properties for smooth transitions.
 */

export type Mood = 'positive' | 'calm' | 'stressed' | 'low' | 'focused'

export interface ColorPalette {
  primary: string
  primaryFg: string
  accent: string
  accentFg: string
  bgFrom: string
  bgVia: string
  bgTo: string
  cardBg: string
  cardBorder: string
  muted: string
}

export const PALETTES: Record<Mood, ColorPalette> = {
  positive: {
    primary: '#F59E0B',     // amber
    primaryFg: '#FFFFFF',
    accent: '#10B981',      // emerald
    accentFg: '#FFFFFF',
    bgFrom: '#451A03',      // amber-950
    bgVia: '#1E1B4B',      // dark warm
    bgTo: '#0F172A',
    cardBg: 'rgba(245, 158, 11, 0.05)',
    cardBorder: 'rgba(245, 158, 11, 0.2)',
    muted: '#92400E',
  },
  calm: {
    primary: '#6366F1',     // indigo
    primaryFg: '#FFFFFF',
    accent: '#8B5CF6',      // violet
    accentFg: '#FFFFFF',
    bgFrom: '#0F172A',      // slate-900
    bgVia: '#1E293B',      // slate-800
    bgTo: '#0F172A',
    cardBg: 'rgba(99, 102, 241, 0.05)',
    cardBorder: 'rgba(99, 102, 241, 0.15)',
    muted: '#4338CA',
  },
  stressed: {
    primary: '#06B6D4',     // cyan (cooling)
    primaryFg: '#FFFFFF',
    accent: '#3B82F6',      // blue
    accentFg: '#FFFFFF',
    bgFrom: '#0C4A6E',     // sky-900
    bgVia: '#0F172A',
    bgTo: '#0F172A',
    cardBg: 'rgba(6, 182, 212, 0.05)',
    cardBorder: 'rgba(6, 182, 212, 0.15)',
    muted: '#0891B2',
  },
  low: {
    primary: '#EC4899',     // pink (warming)
    primaryFg: '#FFFFFF',
    accent: '#A78BFA',      // lavender
    accentFg: '#FFFFFF',
    bgFrom: '#1E1B4B',     // soft purple-dark
    bgVia: '#0F172A',
    bgTo: '#0F172A',
    cardBg: 'rgba(236, 72, 153, 0.05)',
    cardBorder: 'rgba(236, 72, 153, 0.15)',
    muted: '#BE185D',
  },
  focused: {
    primary: '#14B8A6',     // teal
    primaryFg: '#FFFFFF',
    accent: '#22C55E',      // green
    accentFg: '#FFFFFF',
    bgFrom: '#0F172A',
    bgVia: '#0F172A',
    bgTo: '#0F172A',
    cardBg: 'rgba(20, 184, 166, 0.05)',
    cardBorder: 'rgba(20, 184, 166, 0.15)',
    muted: '#0D9488',
  },
}

/**
 * Get time-based mood adjustment
 */
export function getTimeMood(): Mood | null {
  const hour = new Date().getHours()

  if (hour >= 6 && hour < 10) return 'positive'  // morning energy
  if (hour >= 22 || hour < 6) return 'low'        // night = calmer/warmer
  return null // no time-based override during day
}

/**
 * Apply palette to CSS custom properties
 */
export function applyPalette(mood: Mood): Record<string, string> {
  const p = PALETTES[mood]
  return {
    '--color-primary': p.primary,
    '--color-primary-fg': p.primaryFg,
    '--color-accent': p.accent,
    '--color-accent-fg': p.accentFg,
    '--color-bg-from': p.bgFrom,
    '--color-bg-via': p.bgVia,
    '--color-bg-to': p.bgTo,
    '--color-card-bg': p.cardBg,
    '--color-card-border': p.cardBorder,
    '--color-muted': p.muted,
  }
}
