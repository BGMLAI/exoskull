/**
 * GET /api/emails/[id]/attachments/[filename] — Download email attachment
 *
 * Fetches attachment from Gmail API using stored attachmentId.
 * Requires the email to have attachment_metadata with matching filename.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;
  const { id, filename } = await params;
  const decodedFilename = decodeURIComponent(filename);

  const supabase = getServiceSupabase();

  // Get email with attachment metadata
  const { data: email, error } = await supabase
    .from("exo_analyzed_emails")
    .select("provider_message_id, account_id, attachment_metadata, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !email) {
    return NextResponse.json(
      { error: "Email nie znaleziony" },
      { status: 404 },
    );
  }

  // Find attachment metadata
  const attachments = (email.attachment_metadata || []) as AttachmentMeta[];
  const attachment = attachments.find((a) => a.filename === decodedFilename);

  if (!attachment) {
    return NextResponse.json(
      { error: `Zalacznik "${decodedFilename}" nie znaleziony` },
      { status: 404 },
    );
  }

  // Get OAuth connection for Gmail
  const { data: account } = await supabase
    .from("exo_email_accounts")
    .select("provider, rig_connection_id")
    .eq("id", email.account_id)
    .single();

  if (!account || account.provider !== "gmail") {
    return NextResponse.json(
      { error: "Pobieranie zalacznikow dostepne tylko dla Gmail" },
      { status: 400 },
    );
  }

  // Get rig connection with fresh token
  const { data: connection } = await supabase
    .from("exo_rig_connections")
    .select("id, rig_slug, access_token, refresh_token, expires_at")
    .or("rig_slug.eq.google,rig_slug.eq.google-workspace")
    .eq("tenant_id", tenantId)
    .limit(1)
    .single();

  if (!connection?.access_token) {
    return NextResponse.json(
      { error: "Brak polaczenia OAuth z Google" },
      { status: 401 },
    );
  }

  try {
    const freshToken = await ensureFreshToken(connection);

    // Fetch attachment from Gmail API
    const url = `${GMAIL_API}/messages/${email.provider_message_id}/attachments/${attachment.attachmentId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[AttachmentDownload] Gmail API error:", {
        status: response.status,
        error: errText.slice(0, 200),
      });
      return NextResponse.json(
        { error: `Gmail API error: ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    // Gmail returns base64url-encoded data
    const base64Data = (data.data || "").replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${decodedFilename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("[AttachmentDownload] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Blad pobierania zalacznika",
      },
      { status: 500 },
    );
  }
});
