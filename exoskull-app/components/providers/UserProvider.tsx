'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useMemo,
} from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { UserProfile, UserContextValue } from '@/lib/types/user'
import { createClient } from '@/lib/supabase/client'

const UserContext = createContext<UserContextValue | undefined>(undefined)

interface UserProviderProps {
  children: ReactNode
  initialUser: UserProfile | null
}

export function UserProvider({ children, initialUser }: UserProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(initialUser)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Check if first visit (from onboarding redirect)
  const isFirstVisit = searchParams.get('welcome') === 'true'

  // Clear welcome param from URL after reading (without full page reload)
  useEffect(() => {
    if (isFirstVisit && typeof window !== 'undefined') {
      // Store in sessionStorage so we can show modal even after URL cleanup
      sessionStorage.setItem('exo_welcome_shown', 'pending')

      // Clean up URL
      const url = new URL(window.location.href)
      url.searchParams.delete('welcome')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [isFirstVisit, router])

  // Check sessionStorage for first visit flag
  const shouldShowWelcome = useMemo(() => {
    if (typeof window === 'undefined') return isFirstVisit
    const stored = sessionStorage.getItem('exo_welcome_shown')
    return isFirstVisit || stored === 'pending'
  }, [isFirstVisit])

  // Refetch user profile from server
  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/user/profile')

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch profile')
      }

      const data = await response.json()
      setUser(data.profile)
    } catch (err) {
      console.error('[UserProvider] Refetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Update user profile
  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
    if (!user) return false

    // Optimistic update
    const previousUser = user
    setUser({ ...user, ...updates })
    setError(null)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const data = await response.json()
      setUser(data.profile)
      return true
    } catch (err) {
      console.error('[UserProvider] Update error:', err)
      // Rollback on error
      setUser(previousUser)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    }
  }, [user])

  // Mark welcome as shown
  const markWelcomeShown = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('exo_welcome_shown', 'done')
    }
  }, [])

  const contextValue = useMemo<UserContextValue>(() => ({
    user,
    isLoading,
    error,
    isFirstVisit: shouldShowWelcome,
    refetch,
    updateProfile,
  }), [user, isLoading, error, shouldShowWelcome, refetch, updateProfile])

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  )
}

// Hook to use user context
export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

// Hook to mark welcome modal as dismissed
export function useWelcomeDismiss() {
  const markWelcomeShown = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('exo_welcome_shown', 'done')
    }
  }, [])

  const isWelcomePending = useCallback(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('exo_welcome_shown') === 'pending'
  }, [])

  return { markWelcomeShown, isWelcomePending }
}
