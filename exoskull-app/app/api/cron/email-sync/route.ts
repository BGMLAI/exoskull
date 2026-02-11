/**
 * CRON: Email Sync — Fetches new emails from all connected accounts
 * Schedule: Every 15 minutes
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { syncAllAccounts } from "@/lib/email/sync";

async function handler(_req: NextRequest) {
  const results = await syncAllAccounts(50_000);

  const totalNew = results.reduce((sum, r) => sum + r.newEmails, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  return NextResponse.json({
    accounts: results.length,
    newEmails: totalNew,
    errors: totalErrors,
    details: results,
  });
}

export const GET = withCronGuard({ name: "email-sync" }, handler);
