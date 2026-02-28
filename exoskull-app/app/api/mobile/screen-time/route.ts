/**
 * Screen Time Sync API — receives app usage data from Android.
 *
 * POST /api/mobile/screen-time
 *   Body: { entries: [{ package_name, category, duration_ms, opened_count, date }] }
 *
 * GET /api/mobile/screen-time?date=YYYY-MM-DD&days=7
 *   Returns screen time entries + phenotyping snapshot.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

interface ScreenTimeEntry {
  package_name: string;
  category?: string;
  duration_ms: number;
  opened_count: number;
  date: string; // YYYY-MM-DD
}

// ── POST: receive screen time from Android ──

export const POST = withApiLog(async function POST(req: NextRequest) {
  const auth = await verifyTenantAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const entries: ScreenTimeEntry[] = body.entries;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { error: "Missing or empty 'entries' array" },
      { status: 400 },
    );
  }

  if (entries.length > 500) {
    return NextResponse.json(
      { error: "Max 500 entries per request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  const rows = entries.map((e) => ({
    tenant_id: auth.tenantId,
    package_name: e.package_name,
    category: e.category || "unknown",
    duration_ms: Math.max(0, Math.round(e.duration_ms)),
    opened_count: Math.max(0, Math.round(e.opened_count)),
    date: e.date,
  }));

  const { error, count } = await supabase
    .from("exo_screen_time_entries")
    .upsert(rows, { onConflict: "tenant_id,package_name,date" })
    .select("id");

  if (error) {
    logger.error("[ScreenTime] Insert failed:", {
      error: error.message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      { error: "Failed to store screen time data" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    stored: count ?? rows.length,
    syncedAt: new Date().toISOString(),
  });
});

// ── GET: query screen time + snapshot ──

export const GET = withApiLog(async function GET(req: NextRequest) {
  const auth = await verifyTenantAuth(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const date =
    searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const days = Math.min(parseInt(searchParams.get("days") || "1", 10), 30);

  const supabase = getServiceSupabase();

  // Calculate date range
  const endDate = new Date(date);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);

  const { data: entries, error } = await supabase
    .from("exo_screen_time_entries")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .gte("date", startDate.toISOString().slice(0, 10))
    .lte("date", endDate.toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .order("duration_ms", { ascending: false });

  if (error) {
    logger.error("[ScreenTime] Query failed:", {
      error: error.message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      { error: "Failed to query screen time" },
      { status: 500 },
    );
  }

  // Aggregate by category per day
  const byDay: Record<string, Record<string, number>> = {};
  let totalMs = 0;

  for (const entry of entries || []) {
    const d = entry.date;
    if (!byDay[d]) byDay[d] = {};
    byDay[d][entry.category] =
      (byDay[d][entry.category] || 0) + entry.duration_ms;
    totalMs += entry.duration_ms;
  }

  return NextResponse.json({
    date,
    days,
    totalMs,
    totalHours: Math.round((totalMs / 3600000) * 10) / 10,
    entries: entries || [],
    byDay,
  });
});
