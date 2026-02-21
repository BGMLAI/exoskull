import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ============================================================================
  // PUBLIC ROUTES (no auth required)
  // ============================================================================

  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/referral/") ||
    pathname.startsWith("/_next/");

  // Public API routes (webhooks, public stats, CRON with own auth, OAuth flows, gateways)
  const isPublicApi =
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/twilio/") ||
    pathname.startsWith("/api/gateway/") || // External messaging webhooks (Telegram, Discord, Slack, Signal, iMessage)
    pathname.startsWith("/api/rigs/") || // OAuth connect/callback + sync (routes verify JWT internally)
    pathname.startsWith("/api/meta/") || // Meta deauth/pages (routes verify JWT internally)
    pathname === "/api/pulse" ||
    pathname === "/api/knowledge/reprocess" || // Has own CRON_SECRET auth
    pathname === "/api/knowledge/reprocess-all" || // Has own CRON_SECRET auth
    pathname.startsWith("/api/mobile/") || // Mobile app — Bearer JWT auth verified in routes
    pathname.startsWith("/api/agent/") || // Local agent — Bearer JWT auth verified in routes
    pathname.startsWith("/api/chat/") || // Chat endpoints — Bearer JWT auth verified in routes (verifyTenantAuth)
    pathname.startsWith("/api/debug/"); // Debug endpoints — own CRON_SECRET auth

  // ============================================================================
  // AUTH GUARD: Redirect unauthenticated users to login
  // ============================================================================

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding");

  const isProtectedApi = pathname.startsWith("/api/") && !isPublicApi;

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!user && isProtectedApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect authenticated users away from login
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ============================================================================
  // ONBOARDING REDIRECT LOGIC
  // ============================================================================

  if (user && !isPublicRoute && !isPublicApi) {
    const isDashboardRoute = pathname.startsWith("/dashboard");
    const isOnboardingRoute = pathname.startsWith("/onboarding");

    if (isDashboardRoute || isOnboardingRoute) {
      try {
        const { data: tenant } = await supabase
          .from("exo_tenants")
          .select("onboarding_status")
          .eq("id", user.id)
          .single();

        const needsOnboarding =
          !tenant?.onboarding_status ||
          tenant.onboarding_status === "pending" ||
          tenant.onboarding_status === "in_progress";

        // Redirect to onboarding if needed (and not already there)
        if (needsOnboarding && isDashboardRoute) {
          return NextResponse.redirect(new URL("/onboarding", request.url));
        }

        // Redirect to dashboard if onboarding completed (and on onboarding page)
        if (!needsOnboarding && isOnboardingRoute) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } catch (error) {
        // If tenant doesn't exist yet, allow access
        logger.error("[Middleware] Error checking onboarding status:", error);
      }
    }
  }

  return response;
}
