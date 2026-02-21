/**
 * Safe error response helper.
 *
 * Strips internal details (stack traces, raw messages) from API responses.
 * Full errors are still logged server-side via the logger.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Return a safe 500 JSON response. Logs full error details server-side.
 */
export function safeErrorResponse(
  context: string,
  error: unknown,
  opts?: { status?: number; publicMessage?: string },
) {
  const status = opts?.status ?? 500;
  const publicMessage = opts?.publicMessage ?? "Internal server error";

  logger.error(`[${context}] Error:`, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json({ error: publicMessage }, { status });
}
