import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

// GET /api/conversations - Get user's conversation history
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get recent conversations
    const { data: conversations, error } = await supabase
      .from("exo_conversations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[Conversations] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 },
    );
  }
}

// POST /api/conversations - Create new conversation
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { context } = await req.json();

    // Create conversation
    const { data: conversation, error } = await supabase
      .from("exo_conversations")
      .insert({
        tenant_id: tenantId,
        context: context || {},
      })
      .select()
      .single();

    if (error) throw error;

    // Return conversation AND tenant_id for VAPI tools
    return NextResponse.json({
      conversation,
      tenant_id: tenantId,
    });
  } catch (error) {
    console.error("[Conversations] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
