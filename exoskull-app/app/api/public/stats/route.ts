/**
 * Public Stats API
 *
 * Returns anonymized stats for social proof on landing page.
 * Cached for 15 minutes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

let cachedStats: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (extended for DoS protection)

export async function GET() {
  // Check cache
  if (cachedStats && Date.now() - cachedStats.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedStats.data, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  }

  try {
    // Use anon key — these are count-only queries on RLS-enabled tables
    // No need for service role key on a public endpoint
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const [users, conversations, interventions] = await Promise.all([
      supabase.from("exo_tenants").select("*", { count: "exact", head: true }),
      supabase
        .from("exo_conversations")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("exo_interventions")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed"),
    ]);

    const stats = {
      users: users.count || 0,
      conversations: conversations.count || 0,
      interventions_delivered: interventions.count || 0,
    };

    cachedStats = { data: stats, timestamp: Date.now() };

    return NextResponse.json(stats, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (error) {
    console.error("[PublicStats] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { users: 0, conversations: 0, interventions_delivered: 0 },
      { status: 200 },
    );
  }
}
