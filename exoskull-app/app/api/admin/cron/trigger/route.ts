import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const CRON_ROUTES: Record<string, string> = {
  "master-scheduler": "/api/cron/master-scheduler",
  "intervention-executor": "/api/cron/intervention-executor",
  "post-conversation": "/api/cron/post-conversation",
  pulse: "/api/pulse",
  "highlight-decay": "/api/cron/highlight-decay",
  "bronze-etl": "/api/cron/bronze-etl",
  "silver-etl": "/api/cron/silver-etl",
  "gold-etl": "/api/cron/gold-etl",
  "business-metrics": "/api/cron/business-metrics",
  dunning: "/api/cron/dunning",
  "guardian-effectiveness": "/api/cron/guardian-effectiveness",
  "guardian-values": "/api/cron/guardian-values",
  "engagement-scoring": "/api/cron/engagement-scoring",
  "drip-engine": "/api/cron/drip-engine",
  "admin-metrics": "/api/cron/admin-metrics",
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const { cronName } = await req.json();

    if (!cronName || !CRON_ROUTES[cronName]) {
      return NextResponse.json(
        { error: `Unknown cron: ${cronName}` },
        { status: 400 },
      );
    }

    const cronSecret = process.env.CRON_SECRET;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const route = CRON_ROUTES[cronName];
    const url = `${baseUrl}${route}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret || "",
      },
      body: JSON.stringify({ source: "admin-trigger" }),
    });

    const result = await response.json().catch(() => ({}));

    return NextResponse.json({
      triggered: cronName,
      status: response.status,
      result,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminCronTrigger] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
