/**
 * Rate Limit Guard — Higher-order wrapper for API route handlers.
 *
 * Composable with withApiLog:
 *   export const POST = withApiLog(withRateLimit("conversations", async (req) => { ... }));
 *
 * Checks tenant rate limits before executing the handler.
 * On success, increments usage (fire-and-forget).
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx?: any) => Promise<Response>;

/**
 * Wrap a route handler with rate limiting for a specific resource.
 *
 * @param resource - "conversations" | "ai_requests" | "voice_minutes" | "coding_sessions"
 * @param handler - The route handler to wrap
 * @param options - Optional config: extractTenantId function, skip increment
 */
export function withRateLimit(
  resource: string,
  handler: RouteHandler,
  options?: {
    /** Custom tenant ID extraction (default: verifyTenantAuth) */
    extractTenantId?: (req: NextRequest) => Promise<string | null>;
    /** Skip usage increment (e.g. for read-only endpoints) */
    skipIncrement?: boolean;
  },
): RouteHandler {
  return async (req, ctx) => {
    try {
      // Lazy import to avoid pulling Supabase into module scope
      const { verifyTenantAuth } = await import("@/lib/auth/verify-tenant");
      const { checkRateLimit, incrementUsage } =
        await import("@/lib/business/rate-limiter");

      // Extract tenant ID
      let tenantId: string | null = null;
      if (options?.extractTenantId) {
        tenantId = await options.extractTenantId(req);
      } else {
        const auth = await verifyTenantAuth(req);
        if (!auth.ok) return auth.response;
        tenantId = auth.tenantId;
      }

      if (!tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check rate limit
      const rateCheck = await checkRateLimit(tenantId, resource);
      if (!rateCheck.allowed) {
        logger.warn(`[RateLimit] ${resource} blocked for tenant`, {
          tenantId,
          resource,
          current: rateCheck.current,
          limit: rateCheck.limit,
          tier: rateCheck.tier,
        });
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            message: rateCheck.upgradeMessage,
            limit: rateCheck.limit,
            current: rateCheck.current,
            tier: rateCheck.tier,
          },
          { status: 429 },
        );
      }

      // Execute handler
      const response = await handler(req, ctx);

      // Increment usage on success (fire-and-forget)
      if (!options?.skipIncrement && response.status < 400) {
        incrementUsage(tenantId, resource).catch((err) => {
          logger.warn(`[RateLimit] Usage increment failed for ${resource}:`, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      return response;
    } catch (error) {
      // If rate limit check itself fails, let the request through
      // (fail-open to not break the API)
      logger.error("[RateLimit] Guard error, failing open:", {
        resource,
        error: error instanceof Error ? error.message : String(error),
      });
      return handler(req, ctx);
    }
  };
}
