/**
 * Twilio Outbound Call API
 *
 * Initiates outbound calls to users.
 * Used for:
 * - Test calls from dashboard
 * - Scheduled check-ins (CRON)
 * - Intervention calls
 */

import { NextRequest, NextResponse } from "next/server";
import { makeOutboundCall } from "@/lib/voice/twilio-client";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// CONFIGURATION
// ============================================================================

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
}

// ============================================================================
// TYPES
// ============================================================================

interface OutboundCallRequest {
  phone?: string; // Phone number to call (optional if tenantId provided)
  tenantId?: string; // Lookup phone from tenant
  purpose?: "test" | "checkin" | "intervention" | "custom";
  message?: string; // Custom message for the call
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const body: OutboundCallRequest = await req.json();
    const { phone, tenantId, purpose = "test" } = body;

    logger.info("[Twilio Outbound] Request:", { phone, tenantId, purpose });

    // Resolve phone number
    let targetPhone = phone;

    if (!targetPhone && tenantId) {
      const supabase = getServiceSupabase();
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("phone")
        .eq("id", tenantId)
        .single();

      if (!tenant?.phone) {
        return NextResponse.json(
          { error: "Tenant phone number not found" },
          { status: 400 },
        );
      }

      targetPhone = tenant.phone;
    }

    if (!targetPhone) {
      return NextResponse.json(
        { error: "Phone number required (provide phone or tenantId)" },
        { status: 400 },
      );
    }

    // Initiate outbound call
    // Pass tenant_id in webhook URL so voice handler knows the user
    const webhookParams = tenantId ? `&tenant_id=${tenantId}` : "";
    const result = await makeOutboundCall({
      to: targetPhone,
      webhookUrl: `${getAppUrl()}/api/twilio/voice?action=start${webhookParams}`,
      statusCallbackUrl: `${getAppUrl()}/api/twilio/status`,
      timeout: 30,
    });

    logger.info("[Twilio Outbound] Call initiated:", {
      callSid: result.callSid,
      to: targetPhone,
      purpose,
    });

    // Pre-create session in database
    if (tenantId) {
      const supabase = getServiceSupabase();
      await supabase.from("exo_voice_sessions").insert({
        call_sid: result.callSid,
        tenant_id: tenantId,
        status: "active",
        messages: [],
        started_at: new Date().toISOString(),
        metadata: {
          direction: "outbound",
          purpose,
        },
      });
    }

    return NextResponse.json({
      success: true,
      callSid: result.callSid,
      status: result.status,
      to: targetPhone,
    });
  } catch (error) {
    console.error("[Twilio Outbound] Error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: `Failed to initiate call: ${message}` },
      { status: 500 },
    );
  }
});

// Test endpoint
export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Twilio Outbound Call API",
    usage: {
      method: "POST",
      body: {
        phone: "+48123456789 (optional if tenantId provided)",
        tenantId: "uuid (optional)",
        purpose: "test | checkin | intervention | custom",
      },
    },
  });
});
