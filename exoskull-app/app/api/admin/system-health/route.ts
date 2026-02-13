/**
 * System Health API — Aggregated health status of all subsystems
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getSystemHealthSnapshot } from "@/lib/system/events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const snapshot = await getSystemHealthSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[AdminSystemHealth] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
