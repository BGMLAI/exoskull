/**
 * /api/claude-code/workspace — Workspace tree and init
 *
 * GET  — Proxy to VPS workspace/tree
 * POST — Proxy to VPS workspace/init
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VPS_EXECUTOR_URL =
  process.env.VPS_EXECUTOR_URL || "http://57.128.253.15:3500";
const VPS_EXECUTOR_SECRET = process.env.VPS_EXECUTOR_SECRET || "";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function isAdminUser(tenantId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

// GET /api/claude-code/workspace?path=src/
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;
    const isAdmin = await isAdminUser(tenantId);

    const url = new URL(request.url);
    const subPath = url.searchParams.get("path") || "";
    const depth = url.searchParams.get("depth") || "3";
    const filePath = url.searchParams.get("file");

    // If file param present, read a specific file
    if (filePath) {
      const vpsUrl = `${VPS_EXECUTOR_URL}/api/agent/code/workspace/file?tenantId=${tenantId}&isAdmin=${isAdmin}&path=${encodeURIComponent(filePath)}`;
      const res = await fetch(vpsUrl, {
        headers: { Authorization: `Bearer ${VPS_EXECUTOR_SECRET}` },
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Otherwise return tree
    const vpsUrl = `${VPS_EXECUTOR_URL}/api/agent/code/workspace/tree?tenantId=${tenantId}&isAdmin=${isAdmin}&path=${encodeURIComponent(subPath)}&depth=${depth}`;
    const res = await fetch(vpsUrl, {
      headers: { Authorization: `Bearer ${VPS_EXECUTOR_SECRET}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ClaudeCode] Workspace GET error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/claude-code/workspace — Initialize workspace
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;
    const isAdmin = await isAdminUser(tenantId);

    const res = await fetch(
      `${VPS_EXECUTOR_URL}/api/agent/code/workspace/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${VPS_EXECUTOR_SECRET}`,
        },
        body: JSON.stringify({ tenantId, isAdmin }),
      },
    );

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ClaudeCode] Workspace POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
