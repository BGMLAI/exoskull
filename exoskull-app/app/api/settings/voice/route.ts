/**
 * Voice Settings API — Get/Set ElevenLabs voice ID
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const svc = getServiceSupabase();
    const { data: tenant } = await svc
      .from("exo_tenants")
      .select("voice_config")
      .eq("id", tenantId)
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
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { voiceId } = await req.json();

    const svc = getServiceSupabase();

    // Get current config
    const { data: tenant } = await svc
      .from("exo_tenants")
      .select("voice_config")
      .eq("id", tenantId)
      .maybeSingle();

    const voiceConfig = {
      ...((tenant?.voice_config as Record<string, unknown>) || {}),
      elevenlabs_voice_id: voiceId,
    };

    const { error } = await svc
      .from("exo_tenants")
      .update({ voice_config: voiceConfig })
      .eq("id", tenantId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
