/**
 * POST /api/admin/thread-reset — Clear poisoned unified thread messages
 *
 * Removes assistant messages that contain false "lite mode" claims,
 * so IORS stops repeating them from context.
 *
 * Auth: requires authenticated user (resets own thread only).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = getServiceSupabase();

    // Find assistant messages with poisoned content (false claims, broken fallbacks)
    const poisonPatterns = [
      // Old "lite mode" false claims
      "trybie podstawowym",
      "tryb podstawowy",
      "lite version",
      "bez dostępu",
      "NIE MAM dostępu",
      "NIE MAM MCP",
      "NIE MAM voice",
      "NIE MAM proaktywnej",
      "nie mam dostępu do Twoich systemów",
      "nie mam połączenia",
      // Broken fallback responses
      "Zrobione!",
      "Gotowe. Użyłem:",
      "Przepraszam, nie mogłem przetworzyć",
    ];

    const { data: messages, error: fetchError } = await service
      .from("exo_unified_messages")
      .select("id, content, role")
      .eq("tenant_id", user.id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(100);

    if (fetchError) {
      console.error("[ThreadReset] Fetch error:", fetchError.message);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 },
      );
    }

    // Find messages matching poison patterns
    const poisonedIds = (messages || [])
      .filter((msg) =>
        poisonPatterns.some(
          (pattern) =>
            msg.content &&
            msg.content.toLowerCase().includes(pattern.toLowerCase()),
        ),
      )
      .map((msg) => msg.id);

    if (poisonedIds.length === 0) {
      return NextResponse.json({
        removed: 0,
        message: "No poisoned messages found",
      });
    }

    const { error: deleteError } = await service
      .from("exo_unified_messages")
      .delete()
      .in("id", poisonedIds);

    if (deleteError) {
      console.error("[ThreadReset] Delete error:", deleteError.message);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    console.log(
      `[ThreadReset] Removed ${poisonedIds.length} poisoned messages for tenant ${user.id}`,
    );

    return NextResponse.json({
      removed: poisonedIds.length,
      message: `Removed ${poisonedIds.length} false "lite mode" messages from context`,
    });
  } catch (error) {
    console.error("[ThreadReset] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
