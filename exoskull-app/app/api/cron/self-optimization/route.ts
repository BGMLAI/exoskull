/**
 * Self-Optimization CRON — DEPRECATED
 * MAPE-K loop removed in v3 cleanup. Keeping route as no-op to avoid Vercel cron errors.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, status: "deprecated" });
}
