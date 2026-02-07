import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/conversations - Get user's conversation history
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get recent conversations
    const { data: conversations, error } = await supabase
      .from("exo_conversations")
      .select("*")
      .eq("tenant_id", user.id)
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { context } = await req.json();

    // Create conversation
    const { data: conversation, error } = await supabase
      .from("exo_conversations")
      .insert({
        tenant_id: user.id,
        context: context || {},
      })
      .select()
      .single();

    if (error) throw error;

    // Return conversation AND tenant_id for VAPI tools
    return NextResponse.json({
      conversation,
      tenant_id: user.id,
    });
  } catch (error) {
    console.error("[Conversations] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
