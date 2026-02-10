/**
 * GET /api/apps — List all generated apps for the authenticated tenant
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = getServiceSupabase();
    const { data: apps, error } = await service
      .from("exo_generated_apps")
      .select(
        "id, slug, name, description, status, table_name, columns, ui_config, widget_size, usage_count, last_used_at, created_at",
      )
      .eq("tenant_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AppList] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ apps: apps || [] });
  } catch (error) {
    console.error("[AppList] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
