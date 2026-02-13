/**
 * GET /api/emails/[id] — Full email detail view
 *
 * Returns complete email body, attachments, AI analysis, and sender profile.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;
  const { id } = await params;

  const supabase = getServiceSupabase();

  // Fetch full email
  const { data: email, error } = await supabase
    .from("exo_analyzed_emails")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !email) {
    return NextResponse.json(
      { error: "Email nie znaleziony" },
      { status: 404 },
    );
  }

  // Fetch sender profile (best-effort)
  let senderProfile = null;
  if (email.from_email) {
    const { data: profile } = await supabase
      .from("exo_email_sender_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("email_address", email.from_email)
      .maybeSingle();
    senderProfile = profile;
  }

  return NextResponse.json({
    email: {
      id: email.id,
      subject: email.subject,
      from_name: email.from_name,
      from_email: email.from_email,
      to_emails: email.to_emails,
      cc_emails: email.cc_emails,
      date_received: email.date_received,
      direction: email.direction,
      body_text: email.body_text,
      body_html: email.body_html,
      snippet: email.snippet,
      has_attachments: email.has_attachments,
      attachment_names: email.attachment_names,
      attachment_metadata: email.attachment_metadata,
      is_read: email.is_read,
      labels: email.labels,
      // AI analysis
      category: email.category,
      priority: email.priority,
      priority_score: email.priority_score,
      sentiment: email.sentiment,
      action_items: email.action_items,
      key_facts: email.key_facts,
      follow_up_needed: email.follow_up_needed,
      follow_up_by: email.follow_up_by,
      analysis_status: email.analysis_status,
    },
    senderProfile,
  });
}
