'use client'

/**
 * Adaptive Theme Provider
 *
 * Provides mood-based theming via CSS custom properties.
 * Updates based on detected emotion from conversations.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { type Mood, applyPalette, getTimeMood } from './color-palette'

// ============================================================================
// CONTEXT
// ============================================================================

interface ThemeContextValue {
  mood: Mood
  setMood: (mood: Mood) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mood: 'calm',
  setMood: () => {}
})

export function useAdaptiveTheme() {
  return useContext(ThemeContext)
}

// ============================================================================
// PROVIDER
// ============================================================================

interface AdaptiveThemeProviderProps {
  children: ReactNode
  defaultMood?: Mood
}

export function AdaptiveThemeProvider({
  children,
  defaultMood = 'calm'
}: AdaptiveThemeProviderProps) {
  const [mood, setMoodState] = useState<Mood>(defaultMood)

  const setMood = useCallback((newMood: Mood) => {
    setMoodState(newMood)
  }, [])

  // Apply CSS custom properties when mood changes
  useEffect(() => {
    const vars = applyPalette(mood)
    const root = document.documentElement

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })

    // Add transition for smooth palette changes
    root.style.setProperty('--theme-transition', 'all 2s ease-in-out')
  }, [mood])

  // Apply time-based mood on mount (if no detected mood)
  useEffect(() => {
    const timeMood = getTimeMood()
    if (timeMood && mood === 'calm') {
      setMoodState(timeMood)
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ mood, setMood }}>
      {children}
    </ThemeContext.Provider>
  )
}
