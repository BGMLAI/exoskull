/**
 * Email API — list/search emails with full body for the Email page
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || user.id;
    const query = searchParams.get("query");
    const category = searchParams.get("category");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const svc = getServiceSupabase();

    let q = svc
      .from("exo_analyzed_emails")
      .select(
        "id, subject, from_name, from_email, to_emails, cc_emails, date_received, category, priority, snippet, body_text, body_html, is_read, follow_up_needed, follow_up_by, direction, has_attachments, attachment_names, attachment_metadata, action_items, key_facts, sentiment",
      )
      .eq("tenant_id", tenantId)
      .order("date_received", { ascending: false })
      .limit(limit);

    if (category && category !== "all") {
      q = q.eq("category", category);
    }

    if (query) {
      q = q.or(
        `subject.ilike.%${query}%,snippet.ilike.%${query}%,from_name.ilike.%${query}%,body_text.ilike.%${query}%`,
      );
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ emails: data || [] });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
