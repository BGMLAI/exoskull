import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * v3 Autonomy Test — quick smoke test for v3 subsystems
 * GET /api/v3/test-autonomy?tenant_id=xxx
 */
export async function GET(req: Request) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id");

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const results: Record<string, { ok: boolean; detail: string }> = {};

  // 1. Check v3 tables exist
  try {
    const { count } = await supabase
      .from("exo_autonomy_queue")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    results.autonomy_queue = { ok: true, detail: `${count ?? 0} items` };
  } catch (e) {
    results.autonomy_queue = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  try {
    const { count } = await supabase
      .from("exo_autonomy_log")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    results.autonomy_log = { ok: true, detail: `${count ?? 0} events` };
  } catch (e) {
    results.autonomy_log = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  try {
    const { count } = await supabase
      .from("exo_organism_knowledge")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    results.organism_knowledge = {
      ok: true,
      detail: `${count ?? 0} entries`,
    };
  } catch (e) {
    results.organism_knowledge = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  // 2. Check tenant has v3 columns
  try {
    const { data } = await supabase
      .from("exo_tenants")
      .select("permission_level, quiet_hours_start, quiet_hours_end")
      .eq("id", tenantId)
      .single();
    results.tenant_v3_columns = {
      ok: !!data?.permission_level,
      detail: data
        ? `permission=${data.permission_level}, quiet=${data.quiet_hours_start}-${data.quiet_hours_end}`
        : "no tenant",
    };
  } catch (e) {
    results.tenant_v3_columns = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  // 3. Check v3 tools load
  try {
    const { V3_TOOLS } = await import("@/lib/v3/tools");
    results.v3_tools = { ok: true, detail: `${V3_TOOLS.length} tools loaded` };
  } catch (e) {
    results.v3_tools = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  // 4. Check Anthropic API key
  results.anthropic_key = {
    ok: !!process.env.ANTHROPIC_API_KEY,
    detail: process.env.ANTHROPIC_API_KEY ? "set" : "MISSING",
  };

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({
    status: allOk ? "PASS" : "FAIL",
    timestamp: new Date().toISOString(),
    results,
  });
}
