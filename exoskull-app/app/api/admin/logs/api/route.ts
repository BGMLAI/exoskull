import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    const path = req.nextUrl.searchParams.get("path");
    const status = req.nextUrl.searchParams.get("status");
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = db
      .from("admin_api_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (path) query = query.ilike("path", `%${path}%`);
    if (status === "errors") query = query.gte("status_code", 400);

    query = query.range(from, to);

    const { data, count } = await query;

    // Latency percentiles (last 24h)
    const { data: latencyData } = await db
      .from("admin_api_logs")
      .select("duration_ms")
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .order("duration_ms", { ascending: true });

    const durations = (latencyData || []).map(
      (d: { duration_ms: number }) => d.duration_ms,
    );
    const p50 =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const p95 =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;
    const p99 =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0;

    return NextResponse.json({
      logs: data || [],
      total: count || 0,
      page,
      limit,
      latency: { p50, p95, p99 },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminApiLogs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
