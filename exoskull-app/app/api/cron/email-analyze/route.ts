/**
 * CRON: Email Analysis — Classifies and extracts insights from pending emails
 * Schedule: Every 5 minutes
 * Uses ONLY Tier 1 (Gemini Flash) for both classification and deep analysis
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { analyzeEmails } from "@/lib/email/analyzer";

async function handler(_req: NextRequest) {
  const result = await analyzeEmails(50_000);

  return NextResponse.json(result);
}

export const GET = withCronGuard({ name: "email-analyze" }, handler);
