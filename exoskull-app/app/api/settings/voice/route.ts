/**
 * Voice Settings API — Get/Set ElevenLabs voice ID
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getServiceSupabase();
    const { data: tenant } = await svc
      .from("exo_tenants")
      .select("voice_config")
      .eq("id", user.id)
      .maybeSingle();

    const voiceConfig = (tenant?.voice_config || {}) as Record<string, string>;

    return NextResponse.json({
      voiceId: voiceConfig.elevenlabs_voice_id || "",
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { voiceId } = await req.json();

    const svc = getServiceSupabase();

    // Get current config
    const { data: tenant } = await svc
      .from("exo_tenants")
      .select("voice_config")
      .eq("id", user.id)
      .maybeSingle();

    const voiceConfig = {
      ...((tenant?.voice_config as Record<string, unknown>) || {}),
      elevenlabs_voice_id: voiceId,
    };

    const { error } = await svc
      .from("exo_tenants")
      .update({ voice_config: voiceConfig })
      .eq("id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
