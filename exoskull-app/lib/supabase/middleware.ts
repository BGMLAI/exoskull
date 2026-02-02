import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Onboarding redirect logic
  const pathname = request.nextUrl.pathname

  // Skip onboarding check for public routes and API
  const isPublicRoute = pathname === '/login' ||
    pathname === '/auth/callback' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')

  if (user && !isPublicRoute) {
    // Check if user needs onboarding
    const isDashboardRoute = pathname.startsWith('/dashboard')
    const isOnboardingRoute = pathname.startsWith('/onboarding')

    if (isDashboardRoute || isOnboardingRoute) {
      try {
        const { data: tenant } = await supabase
          .from('exo_tenants')
          .select('onboarding_status')
          .eq('id', user.id)
          .single()

        const needsOnboarding = !tenant?.onboarding_status ||
          tenant.onboarding_status === 'pending' ||
          tenant.onboarding_status === 'in_progress'

        // Redirect to onboarding if needed (and not already there)
        if (needsOnboarding && isDashboardRoute) {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }

        // Redirect to dashboard if onboarding completed (and on onboarding page)
        if (!needsOnboarding && isOnboardingRoute) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } catch (error) {
        // If tenant doesn't exist yet, allow access
        console.error('[Middleware] Error checking onboarding status:', error)
      }
    }
  }

  return response
}
