// =====================================================
// GET/PATCH /api/skills/suggestions
// Fetch and manage proactive skill suggestions
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getPendingSuggestions,
  updateSuggestionStatus,
} from "@/lib/skills/detector";
import { generateSkill } from "@/lib/skills/generator/skill-generator";
import { initiateApproval } from "@/lib/skills/approval/approval-gateway";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const suggestions = await getPendingSuggestions(tenantId, 5);

    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error("[Skills API] Suggestions GET error:", error);
    return NextResponse.json(
      { error: "Failed to load suggestions" },
      { status: 500 },
    );
  }
});

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await request.json();
    const { id, action } = body as {
      id?: string;
      action?: "accept" | "dismiss";
    };

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing id or action" },
        { status: 400 },
      );
    }

    if (action === "dismiss") {
      await updateSuggestionStatus(id, "rejected");
      return NextResponse.json({ success: true, action: "dismissed" });
    }

    if (action === "accept") {
      // Mark suggestion as accepted
      await updateSuggestionStatus(id, "accepted");

      // Generate the skill from the suggestion description
      // We need to fetch the suggestion first to get the description
      const suggestions = await getPendingSuggestions(tenantId, 10);
      const suggestion = suggestions.find(
        (s) => s.id === id || s.status === "accepted",
      );

      if (!suggestion) {
        return NextResponse.json(
          { error: "Suggestion not found" },
          { status: 404 },
        );
      }

      const result = await generateSkill({
        tenant_id: tenantId,
        description: suggestion.description,
        source:
          suggestion.source === "request_parse"
            ? "user_request"
            : suggestion.source === "gap_detection"
              ? "gap_detection"
              : "pattern_match",
      });

      if (!result.success || !result.skill) {
        await updateSuggestionStatus(id, "rejected");
        return NextResponse.json(
          {
            error: result.error || "Failed to generate skill from suggestion",
            validationErrors: result.validationErrors,
          },
          { status: 422 },
        );
      }

      // Link suggestion to generated skill
      await updateSuggestionStatus(id, "generated", result.skill.id);

      // Initiate approval flow
      const approvalResult = await initiateApproval(result.skill);

      return NextResponse.json({
        success: true,
        action: "accepted",
        skill: {
          id: result.skill.id,
          slug: result.skill.slug,
          name: result.skill.name,
          approval_status: result.skill.approval_status,
        },
        approval: {
          initiated: approvalResult.success,
          requestId: approvalResult.approvalRequestId,
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    logger.error("[Skills API] Suggestions PATCH error:", error);
    return NextResponse.json(
      {
        error: "Failed to process suggestion",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
});
