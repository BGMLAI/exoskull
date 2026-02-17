// =====================================================
// POST /api/skills/[id]/approve - Submit approval code
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import {
  confirmChannel,
  rejectApproval,
} from "@/lib/skills/approval/approval-gateway";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id: skillId } = await params;
    const body = await request.json();
    const { code, channel, action } = body as {
      code?: string;
      channel?: "sms" | "email";
      action?: "approve" | "reject";
    };

    // Handle rejection
    if (action === "reject") {
      const approvalRequestId = await findApprovalRequest(skillId, tenantId);
      if (!approvalRequestId) {
        return NextResponse.json(
          { error: "No pending approval found" },
          { status: 404 },
        );
      }

      const result = await rejectApproval(approvalRequestId, body.reason);
      return NextResponse.json({ success: result.success, status: "rejected" });
    }

    // Handle approval
    if (!code) {
      return NextResponse.json(
        { error: "Missing confirmation code" },
        { status: 400 },
      );
    }

    // Find the approval request for this skill
    const approvalRequestId = await findApprovalRequest(skillId, tenantId);
    if (!approvalRequestId) {
      return NextResponse.json(
        { error: "No pending approval found" },
        { status: 404 },
      );
    }

    const result = await confirmChannel(
      approvalRequestId,
      code,
      channel || "sms",
    );

    if (result.status === "invalid_code") {
      return NextResponse.json(
        {
          error: result.error || "Invalid confirmation code",
          status: result.status,
        },
        { status: 400 },
      );
    }

    if (result.status === "expired") {
      return NextResponse.json(
        { error: "Approval request has expired", status: result.status },
        { status: 410 },
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      message:
        result.status === "approved"
          ? "Skill approved and activated!"
          : "Channel 1 confirmed. Please confirm via second channel.",
    });
  } catch (error) {
    logger.error("[Skills API] Approve error:", error);
    return NextResponse.json(
      {
        error: "Failed to process approval",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
});

async function findApprovalRequest(
  skillId: string,
  tenantId: string,
): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("exo_skill_approval_requests")
    .select("id")
    .eq("skill_id", skillId)
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "channel_1_confirmed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .single();

  return data?.id || null;
}
