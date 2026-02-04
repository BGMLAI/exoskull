import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/save-profile - Save onboarding form data
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    console.log("[SaveProfile] Received data for tenant:", user.id);

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
      source: "onboarding_form",
      completed_at: new Date().toISOString(),
    };

    // Update tenant
    const { error: updateError } = await supabase
      .from("exo_tenants")
      .update(updateData)
      .eq("id", user.id);

    if (updateError) {
      console.error("[SaveProfile] Error updating tenant:", updateError);
      return NextResponse.json(
        { error: "Failed to save profile" },
        { status: 500 },
      );
    }

    console.log("[SaveProfile] Profile saved for tenant:", user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SaveProfile] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
