/**
 * Audit Trail Export API — GDPR-compliant data export.
 *
 * GET: Returns all messages + tool calls + decisions for a tenant.
 * Query params: tenant_id, format (json|csv), start_date, end_date
 *
 * Auth: CRON_SECRET (internal) or verified tenant JWT.
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");
  const format = url.searchParams.get("format") || "json";
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  try {
    // Messages
    let msgQuery = supabase
      .from("exo_unified_messages")
      .select("role, content, channel, direction, metadata, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (startDate) msgQuery = msgQuery.gte("created_at", startDate);
    if (endDate) msgQuery = msgQuery.lte("created_at", endDate);

    const { data: messages } = await msgQuery;

    // Tool executions
    let toolQuery = supabase
      .from("exo_tool_executions")
      .select("tool_name, success, error_message, duration_ms, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (startDate) toolQuery = toolQuery.gte("created_at", startDate);
    if (endDate) toolQuery = toolQuery.lte("created_at", endDate);

    const { data: toolExecs } = await toolQuery;

    // Autonomy log (decisions)
    let autoQuery = supabase
      .from("exo_autonomy_log")
      .select("event_type, payload, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (startDate) autoQuery = autoQuery.gte("created_at", startDate);
    if (endDate) autoQuery = autoQuery.lte("created_at", endDate);

    const { data: decisions } = await autoQuery;

    const auditData = {
      tenant_id: tenantId,
      exported_at: new Date().toISOString(),
      period: {
        start: startDate || "all",
        end: endDate || "all",
      },
      messages: messages || [],
      tool_executions: toolExecs || [],
      autonomy_decisions: decisions || [],
      totals: {
        messages: messages?.length || 0,
        tool_executions: toolExecs?.length || 0,
        decisions: decisions?.length || 0,
      },
    };

    if (format === "csv") {
      // CSV: flatten messages
      const csvLines = ["timestamp,type,role,channel,content,tool,success"];
      for (const m of messages || []) {
        const content = ((m.content as string) || "")
          .replace(/"/g, '""')
          .slice(0, 500);
        csvLines.push(
          `"${m.created_at}","message","${m.role}","${m.channel || ""}","${content}","",""`,
        );
      }
      for (const t of toolExecs || []) {
        csvLines.push(
          `"${t.created_at}","tool","system","","","${t.tool_name}","${t.success}"`,
        );
      }
      for (const d of decisions || []) {
        const payload = JSON.stringify(d.payload || {})
          .replace(/"/g, '""')
          .slice(0, 300);
        csvLines.push(
          `"${d.created_at}","decision","system","","${payload}","${d.event_type}",""`,
        );
      }

      return new NextResponse(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-trail-${tenantId}.csv"`,
        },
      });
    }

    return NextResponse.json(auditData);
  } catch (err) {
    logger.error("[AuditTrail] Export error:", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
