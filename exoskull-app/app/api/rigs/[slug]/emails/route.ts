import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RigConnection } from "@/lib/rigs/types";
import { createGoogleClient } from "@/lib/rigs/google/client";
import { createGoogleWorkspaceClient } from "@/lib/rigs/google-workspace/client";
import { createMicrosoft365Client } from "@/lib/rigs/microsoft-365/client";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/rigs/[slug]/emails - Fetch recent emails
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  try {
    const supabase = getSupabase();

    // Get connection with token
    const { data: connection, error: connError } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .eq("sync_status", "success")
      .single();

    if (connError || !connection || !connection.access_token) {
      return NextResponse.json(
        { error: "Rig not connected or no access token", slug },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const maxResults = Math.min(
      parseInt(searchParams.get("max") || "10", 10),
      50,
    );

    let emails: unknown[] = [];
    let unreadCount = 0;

    switch (slug) {
      case "google": {
        const client = createGoogleClient(connection as RigConnection);
        if (!client) throw new Error("Failed to create Google client");
        const [recentEmails, unread] = await Promise.all([
          client.gmail.getRecentEmails(maxResults),
          client.gmail.getUnreadCount(),
        ]);
        emails = recentEmails;
        unreadCount = unread;
        break;
      }

      case "google-workspace": {
        const client = createGoogleWorkspaceClient(connection as RigConnection);
        if (!client)
          throw new Error("Failed to create Google Workspace client");
        const dashboard = await client.getDashboardData();
        emails = dashboard.gmail.recentEmails;
        unreadCount = dashboard.gmail.unreadCount;
        break;
      }

      case "microsoft-365": {
        const client = createMicrosoft365Client(connection as RigConnection);
        if (!client) throw new Error("Failed to create Microsoft 365 client");
        const dashboard = await client.getDashboardData();
        emails = dashboard.outlook.recentEmails;
        unreadCount = dashboard.outlook.unreadCount;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Email not supported for rig: ${slug}` },
          { status: 400 },
        );
    }

    return NextResponse.json({
      slug,
      unreadCount,
      emails,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Rig Emails] ${slug} failed:`, {
      error: (error as Error).message,
      tenantId,
    });
    return NextResponse.json(
      {
        error: (error as Error).message,
        slug,
      },
      { status: 500 },
    );
  }
}
