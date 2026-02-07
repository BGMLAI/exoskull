import { NextResponse } from "next/server";
import { queryDatabase } from "@/lib/db-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const agents = await queryDatabase("exo_agents", {
      filter: { is_global: true },
      order: { column: "tier", ascending: true },
    });

    return NextResponse.json({ data: agents, error: null });
  } catch (error) {
    console.error("[Agents] DB query error:", error);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Failed to fetch agents", code: "DB_ERROR" },
      },
      { status: 500 },
    );
  }
}
