/**
 * Sanitized error response helper.
 *
 * Logs full error server-side, returns generic message to client.
 * Prevents leaking stack traces, DB schema, or internal details.
 */

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
interface ErrorResponseOptions {
  /** Prefix for server-side log (e.g. "[Gateway:Telegram]") */
  context: string;
  /** HTTP status code (default: 500) */
  status?: number;
  /** Public message to return to client (default: "Internal server error") */
  publicMessage?: string;
}

/**
 * Create a safe error response that logs details server-side only.
 *
 * Usage:
 * ```ts
 * catch (error) {
 *   return safeErrorResponse(error, { context: "[Gateway:Telegram]" });
 * }
 * ```
 */
export function safeErrorResponse(
  error: unknown,
  options: ErrorResponseOptions,
): NextResponse {
  const {
    context,
    status = 500,
    publicMessage = "Internal server error",
  } = options;

  logger.error(`${context} Error:`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json({ error: publicMessage }, { status });
}
