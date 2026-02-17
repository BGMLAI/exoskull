/**
 * Facebook Data Deletion Status Check
 *
 * Returns the status of a data deletion request.
 * Used by the URL returned in the deauth callback.
 */

import { NextRequest, NextResponse } from "next/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing confirmation code" },
      { status: 400 },
    );
  }

  // For now, always return "completed" since we process deletions immediately
  return NextResponse.json({
    confirmation_code: code,
    status: "completed",
    message:
      "All user data associated with this Facebook account has been deleted.",
  });
});
