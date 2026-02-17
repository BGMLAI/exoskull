import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    const severity = req.nextUrl.searchParams.get("severity");
    const source = req.nextUrl.searchParams.get("source");
    const resolved = req.nextUrl.searchParams.get("resolved");
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = db
      .from("admin_error_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (severity) query = query.eq("severity", severity);
    if (source) query = query.ilike("source", `%${source}%`);
    if (resolved === "true") query = query.eq("resolved", true);
    if (resolved === "false") query = query.eq("resolved", false);

    query = query.range(from, to);

    const { data, count } = await query;

    return NextResponse.json({
      errors: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    logger.error("[AdminErrorLogs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
