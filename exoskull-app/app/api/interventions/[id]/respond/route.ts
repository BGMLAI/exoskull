/**
 * Intervention Respond API
 *
 * POST /api/interventions/[id]/respond — Approve, dismiss, or give feedback on an intervention.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

interface RespondBody {
  action: "approve" | "dismiss" | "feedback";
  feedback?: "helpful" | "neutral" | "unhelpful" | "harmful";
  rating?: number;
}

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { id } = await params;
    const body: RespondBody = await request.json();

    if (
      !body.action ||
      !["approve", "dismiss", "feedback"].includes(body.action)
    ) {
      return NextResponse.json(
        { error: "action must be 'approve', 'dismiss', or 'feedback'" },
        { status: 400 },
      );
    }

    const serviceSupabase = getServiceSupabase();

    // Verify intervention belongs to this user
    const { data: intervention, error: fetchErr } = await serviceSupabase
      .from("exo_interventions")
      .select("id, status, tenant_id, title, intervention_type, action_payload")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (fetchErr || !intervention) {
      return NextResponse.json(
        { error: "Intervention not found" },
        { status: 404 },
      );
    }

    if (body.action === "approve") {
      // Set status to approved
      await serviceSupabase
        .from("exo_interventions")
        .update({
          status: "approved",
          approved_by: "user",
          user_response_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else if (body.action === "dismiss") {
      // Cancel the intervention
      await serviceSupabase
        .from("exo_interventions")
        .update({
          status: "cancelled",
          user_response_at: new Date().toISOString(),
          user_feedback: "unhelpful",
        })
        .eq("id", id);
    }

    // Record feedback if provided
    if (body.action === "feedback" || body.feedback || body.rating) {
      // Update intervention feedback
      if (body.feedback) {
        await serviceSupabase
          .from("exo_interventions")
          .update({ user_feedback: body.feedback })
          .eq("id", id);
      }

      // Insert into feedback table
      if (body.rating || body.feedback) {
        await serviceSupabase.from("exo_feedback").insert({
          tenant_id: tenantId,
          feedback_type: "action",
          rating: body.rating || null,
          message: body.feedback || null,
          context: {
            intervention_id: id,
            intervention_type: intervention.intervention_type,
          },
          channel: "dashboard",
        });
      }
    }

    return NextResponse.json({ success: true, action: body.action });
  } catch (error) {
    logger.error("[Interventions] Respond error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
