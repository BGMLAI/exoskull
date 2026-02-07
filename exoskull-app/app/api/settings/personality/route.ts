/**
 * IORS Personality Settings API
 *
 * PATCH: Update IORS personality parameters (name, style axes, language, etc.)
 * Auth: session-based (middleware protected)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PERSONALITY } from "@/lib/iors/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Load current personality
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("iors_personality, iors_name")
      .eq("id", user.id)
      .single();

    const current = (tenant?.iors_personality as Record<string, unknown>) || {};
    const currentStyle =
      (current.style as Record<string, number>) || DEFAULT_PERSONALITY.style;

    // Deep merge with validation
    const clamp = (
      v: unknown,
      min: number,
      max: number,
    ): number | undefined => {
      if (v === undefined || v === null) return undefined;
      const n = Number(v);
      if (isNaN(n)) return undefined;
      return Math.max(min, Math.min(max, Math.round(n)));
    };

    const updatedPersonality = {
      name: body.name ?? current.name ?? DEFAULT_PERSONALITY.name,
      voice_id: current.voice_id ?? DEFAULT_PERSONALITY.voice_id,
      language:
        body.language ?? current.language ?? DEFAULT_PERSONALITY.language,
      style: {
        formality: clamp(body.formality, 0, 100) ?? currentStyle.formality,
        humor: clamp(body.humor, 0, 100) ?? currentStyle.humor,
        directness: clamp(body.directness, 0, 100) ?? currentStyle.directness,
        empathy: clamp(body.empathy, 0, 100) ?? currentStyle.empathy,
        detail_level:
          clamp(body.detail_level, 0, 100) ?? currentStyle.detail_level,
      },
      proactivity:
        clamp(body.proactivity, 0, 100) ??
        (current.proactivity as number) ??
        DEFAULT_PERSONALITY.proactivity,
      communication_hours: {
        start:
          body.communication_hours_start ??
          (current.communication_hours as Record<string, string>)?.start ??
          DEFAULT_PERSONALITY.communication_hours.start,
        end:
          body.communication_hours_end ??
          (current.communication_hours as Record<string, string>)?.end ??
          DEFAULT_PERSONALITY.communication_hours.end,
      },
    };

    // Validate language
    if (!["pl", "en", "auto"].includes(updatedPersonality.language)) {
      updatedPersonality.language = DEFAULT_PERSONALITY.language;
    }

    const { error } = await supabase
      .from("exo_tenants")
      .update({
        iors_personality: updatedPersonality,
        iors_name: updatedPersonality.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("[PersonalityAPI] Update failed:", {
        userId: user.id,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to update personality" },
        { status: 500 },
      );
    }

    return NextResponse.json({ personality: updatedPersonality });
  } catch (error) {
    console.error("[PersonalityAPI] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
