/**
 * Referral API Route
 *
 * GET: Get referral stats for current user
 * POST: Generate referral code
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getReferralStats,
  generateReferralCode,
} from "@/lib/marketing/referrals";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getReferralStats(user.id);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[ReferralAPI] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const code = await generateReferralCode(user.id);
    return NextResponse.json({ code });
  } catch (error) {
    console.error("[ReferralAPI] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
