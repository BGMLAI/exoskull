/**
 * Email API — list/search emails with full body for the Email page
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || auth.tenantId;
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
        `subject.ilike.%${query}%,snippet.ilike.%${query}%,from_name.ilike.%${query}%,from_email.ilike.%${query}%,body_text.ilike.%${query}%`,
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
});
