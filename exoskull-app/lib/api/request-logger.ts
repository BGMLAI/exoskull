/**
 * API Request Logger
 *
 * Lightweight wrapper for Next.js route handlers that:
 * 1. Generates a request ID (x-request-id header)
 * 2. Measures handler duration
 * 3. Logs structured request info (method, path, status, duration, tenant)
 * 4. Persists to admin_api_logs (fire-and-forget)
 *
 * Usage:
 *   import { withApiLog } from "@/lib/api/request-logger";
 *   export const GET = withApiLog(async (req) => { ... });
 *   export const POST = withApiLog(async (req) => { ... });
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx?: any) => Promise<Response>;

/**
 * Wrap a route handler with structured request logging.
 */
export function withApiLog(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = Date.now();
    const requestId =
      req.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);
    const method = req.method;
    const path = new URL(req.url).pathname;

    let status = 500;
    let errorMsg: string | undefined;

    try {
      const response = await handler(req, ctx);
      status = response.status;

      // Clone response to add request ID header
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
      status = 500;
      logger.error(`[API] ${method} ${path} unhandled error`, {
        requestId,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    } finally {
      const durationMs = Date.now() - start;

      // Structured log for every request
      const logFn =
        status >= 500
          ? logger.error
          : status >= 400
            ? logger.warn
            : logger.info;
      logFn(`[API] ${method} ${path} ${status} ${durationMs}ms`, {
        requestId,
        method,
        path,
        status,
        durationMs,
      });

      // Persist to DB (fire-and-forget, import lazily to avoid circular deps)
      if (durationMs > 100 || status >= 400) {
        persistLog(path, method, status, durationMs, undefined, errorMsg);
      }
    }
  };
}

/**
 * Fire-and-forget DB logging for slow/failed requests.
 * Lazy import to avoid pulling Supabase into every route at module load.
 */
async function persistLog(
  path: string,
  method: string,
  statusCode: number,
  durationMs: number,
  tenantId?: string,
  errorMessage?: string,
) {
  try {
    const { logApiRequest } = await import("@/lib/admin/logger");
    await logApiRequest(
      path,
      method,
      statusCode,
      durationMs,
      tenantId,
      errorMessage,
    );
  } catch {
    // Never let logging break the API
  }
}
