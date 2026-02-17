/**
 * CRON Authentication
 *
 * Shared auth utility for all CRON endpoints.
 * Verifies requests come from Vercel Cron or authorized callers.
 */

import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
/**
 * Verify CRON authorization.
 * Accepts: Authorization Bearer token OR x-cron-secret header.
 *
 * CRON_SECRET must be set in environment variables.
 */
export function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error(
      "[CronAuth] CRITICAL: CRON_SECRET env var not set — rejecting request",
    );
    return false;
  }

  // Method 1: Vercel Cron (Authorization header)
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Method 2: Custom header (for manual testing / admin trigger)
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret === cronSecret) return true;

  return false;
}
