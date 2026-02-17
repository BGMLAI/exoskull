import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

interface LoopPayload {
  slug: string;
  name: string;
  icon: string;
  color: string;
  isCustom: boolean;
  aspects: [string, string, string];
}

/**
 * POST /api/onboarding/save-profile - Save onboarding form data
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) {
      console.error("[SaveProfile] No user session");
      return NextResponse.json(
        { error: "Sesja wygasla. Zaloguj sie ponownie." },
        { status: 401 },
      );
    }
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await request.json();

    logger.info("[SaveProfile] Saving for tenant:", tenantId, {
      preferred_name: body.preferred_name,
      primary_goal: body.primary_goal,
      loops_count: body.selected_loops?.length || 0,
      fields: Object.keys(body).length,
    });

    // Build update object from form data
    const updateData: Record<string, any> = {
      onboarding_status: "in_progress",
    };

    // Direct field mappings
    if (body.preferred_name) updateData.preferred_name = body.preferred_name;
    if (body.primary_goal) updateData.primary_goal = body.primary_goal;
    if (body.secondary_goals) updateData.secondary_goals = body.secondary_goals;
    if (body.communication_style)
      updateData.communication_style = body.communication_style;
    if (body.preferred_channel)
      updateData.preferred_channel = body.preferred_channel;
    if (body.morning_checkin_time)
      updateData.morning_checkin_time = body.morning_checkin_time;
    if (body.evening_checkin_time)
      updateData.evening_checkin_time = body.evening_checkin_time;
    if (body.language) updateData.language = body.language;
    if (body.timezone) updateData.timezone = body.timezone;

    // Build loop_aspects for discovery_data backup
    const loopAspects: Record<string, string[]> = {};
    const selectedLoops: LoopPayload[] = body.selected_loops || [];
    for (const loop of selectedLoops) {
      loopAspects[loop.slug] = loop.aspects;
    }

    // Discovery data (JSON fields)
    updateData.discovery_data = {
      challenge: body.challenge || null,
      quiet_hours: {
        start: body.quiet_hours_start || "22:00",
        end: body.quiet_hours_end || "07:00",
      },
      devices: body.devices || [],
      autonomy: body.autonomy_level || "minor",
      weekend_checkins: body.weekend_checkins ?? false,
      notes: body.notes || null,
      loop_aspects: loopAspects,
      source: "onboarding_form",
      completed_at: new Date().toISOString(),
    };

    // Update tenant
    const { error: updateError } = await supabase
      .from("exo_tenants")
      .update(updateData)
      .eq("id", tenantId);

    if (updateError) {
      console.error("[SaveProfile] Error updating tenant:", {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        userId: tenantId,
      });
      return NextResponse.json(
        { error: `Blad zapisu: ${updateError.message}` },
        { status: 500 },
      );
    }

    // Create user_loops with aspects
    if (selectedLoops.length > 0) {
      const loopRows = selectedLoops.map((loop, index) => ({
        tenant_id: tenantId,
        slug: loop.slug,
        name: loop.name,
        icon: loop.icon,
        color: loop.color,
        is_default: !loop.isCustom,
        is_active: true,
        aspects: loop.aspects,
        priority: index + 1,
      }));

      const { error: loopsError } = await supabase
        .from("user_loops")
        .upsert(loopRows, { onConflict: "tenant_id,slug" });

      if (loopsError) {
        console.error("[SaveProfile] Error creating loops:", {
          code: loopsError.code,
          message: loopsError.message,
          details: loopsError.details,
          userId: tenantId,
          loopCount: loopRows.length,
        });
        // Non-fatal: profile was saved, loops creation failed
        // Don't return error - the profile data is already saved
        logger.warn("[SaveProfile] Loops creation failed but profile saved");
      } else {
        logger.info(
          "[SaveProfile] Created",
          loopRows.length,
          "loops for tenant:",
          tenantId,
        );
      }
    }

    logger.info("[SaveProfile] Profile saved for tenant:", tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SaveProfile] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
