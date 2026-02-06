/**
 * Meta Pages Management API
 *
 * GET  - List connected pages for authenticated tenant
 * POST - Connect pages: fetches user's FB pages via Graph API,
 *        exchanges for page tokens, subscribes to webhook, stores in DB
 * DELETE - Disconnect a page by page_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// =====================================================
// GET - List connected pages for tenant
// =====================================================

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getSupabase();
    const { data: pages, error } = await supabase
      .from("exo_meta_pages")
      .select(
        "id, page_type, page_id, page_name, phone_number, is_active, metadata, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[MetaPages] List error:", {
        error: error.message,
        tenantId,
      });
      return NextResponse.json(
        { error: "Failed to list pages" },
        { status: 500 },
      );
    }

    return NextResponse.json({ pages: pages || [] });
  } catch (error) {
    console.error("[MetaPages] GET error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// =====================================================
// POST - Connect pages from Facebook user access token
// =====================================================

interface ConnectRequest {
  user_access_token: string;
  tenant_id: string;
  page_ids?: string[]; // Optional: only connect specific pages
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenant_id = auth.tenantId;

    const body: ConnectRequest = await req.json();
    const { user_access_token, page_ids } = body;

    if (!user_access_token) {
      return NextResponse.json(
        { error: "Missing user_access_token" },
        { status: 400 },
      );
    }

    // 1. Fetch user's pages from Graph API
    const pagesUrl = `${GRAPH_API_BASE}/me/accounts?access_token=${encodeURIComponent(user_access_token)}&fields=id,name,category,access_token,fan_count,picture`;
    const pagesRes = await fetch(pagesUrl);

    if (!pagesRes.ok) {
      const err = await pagesRes.json();
      console.error("[MetaPages] Failed to fetch pages:", {
        status: pagesRes.status,
        error: err.error?.message,
      });
      return NextResponse.json(
        { error: `Facebook API error: ${err.error?.message || "Unknown"}` },
        { status: 400 },
      );
    }

    const pagesData = await pagesRes.json();
    const allPages: Array<{
      id: string;
      name: string;
      category: string;
      access_token: string;
      fan_count?: number;
      picture?: { data?: { url?: string } };
    }> = pagesData.data || [];

    if (allPages.length === 0) {
      return NextResponse.json(
        { error: "No Facebook Pages found for this account" },
        { status: 404 },
      );
    }

    // 2. Filter to requested pages (or all)
    const pagesToConnect = page_ids
      ? allPages.filter((p) => page_ids.includes(p.id))
      : allPages;

    // 3. Subscribe each page to webhook + store in DB
    const supabase = getSupabase();
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const results: Array<{
      page_id: string;
      page_name: string;
      status: string;
    }> = [];

    for (const page of pagesToConnect) {
      try {
        // Subscribe page to app webhook
        if (appId) {
          const subscribeUrl = `${GRAPH_API_BASE}/${page.id}/subscribed_apps?access_token=${encodeURIComponent(page.access_token)}&subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads`;
          const subRes = await fetch(subscribeUrl, { method: "POST" });
          const subData = await subRes.json();

          if (!subData.success) {
            console.error("[MetaPages] Failed to subscribe page:", {
              pageId: page.id,
              pageName: page.name,
              error: subData.error?.message,
            });
          }
        }

        // Upsert page token in DB
        const { error: upsertError } = await supabase
          .from("exo_meta_pages")
          .upsert(
            {
              tenant_id: tenant_id,
              page_type: "messenger",
              page_id: page.id,
              page_name: page.name,
              page_access_token: page.access_token,
              is_active: true,
              metadata: {
                category: page.category,
                fan_count: page.fan_count,
                profile_pic: page.picture?.data?.url,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "page_type,page_id" },
          );

        if (upsertError) {
          console.error("[MetaPages] Upsert error:", {
            pageId: page.id,
            error: upsertError.message,
          });
          results.push({
            page_id: page.id,
            page_name: page.name,
            status: "error",
          });
        } else {
          results.push({
            page_id: page.id,
            page_name: page.name,
            status: "connected",
          });
        }
      } catch (pageError) {
        console.error("[MetaPages] Page connection error:", {
          pageId: page.id,
          error: pageError instanceof Error ? pageError.message : "Unknown",
        });
        results.push({
          page_id: page.id,
          page_name: page.name,
          status: "error",
        });
      }
    }

    const connected = results.filter((r) => r.status === "connected").length;
    console.log("[MetaPages] Connection result:", {
      tenantId: tenant_id,
      total: pagesToConnect.length,
      connected,
      failed: pagesToConnect.length - connected,
    });

    return NextResponse.json({
      connected,
      total: pagesToConnect.length,
      pages: results,
      available_pages: allPages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        fan_count: p.fan_count,
      })),
    });
  } catch (error) {
    console.error("[MetaPages] POST error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// =====================================================
// DELETE - Disconnect a page
// =====================================================

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { searchParams } = req.nextUrl;
    const pageId = searchParams.get("page_id");

    if (!pageId) {
      return NextResponse.json({ error: "Missing page_id" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("exo_meta_pages")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("page_id", pageId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[MetaPages] Delete error:", {
        pageId,
        tenantId,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to disconnect" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, page_id: pageId });
  } catch (error) {
    console.error("[MetaPages] DELETE error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
