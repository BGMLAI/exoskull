/**
 * Cost Insights API — AI usage cost breakdown.
 *
 * GET: Returns daily/weekly/monthly cost breakdown from exo_ai_usage.
 * Query params: tenant_id, period (day|week|month), start_date, end_date
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");
  const period = url.searchParams.get("period") || "week";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  switch (period) {
    case "day":
      startDate = new Date(now);
      startDate.setUTCHours(0, 0, 0, 0);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default: // week
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
  }

  const { data, error } = await supabase
    .from("exo_ai_usage")
    .select(
      "model, provider, task_category, input_tokens, output_tokens, estimated_cost, created_at",
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({
      tenant_id: tenantId,
      period,
      total_cost: 0,
      total_calls: 0,
      by_model: {},
      by_channel: {},
      by_day: {},
    });
  }

  // Aggregate
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const byModel: Record<string, { cost: number; calls: number }> = {};
  const byChannel: Record<string, { cost: number; calls: number }> = {};
  const byDay: Record<string, { cost: number; calls: number }> = {};

  for (const row of data) {
    const cost = (row.estimated_cost as number) || 0;
    totalCost += cost;
    totalInputTokens += (row.input_tokens as number) || 0;
    totalOutputTokens += (row.output_tokens as number) || 0;

    const model = (row.model as string) || "unknown";
    if (!byModel[model]) byModel[model] = { cost: 0, calls: 0 };
    byModel[model].cost += cost;
    byModel[model].calls++;

    const channel = (row.task_category as string) || "unknown";
    if (!byChannel[channel]) byChannel[channel] = { cost: 0, calls: 0 };
    byChannel[channel].cost += cost;
    byChannel[channel].calls++;

    const day = (row.created_at as string).slice(0, 10);
    if (!byDay[day]) byDay[day] = { cost: 0, calls: 0 };
    byDay[day].cost += cost;
    byDay[day].calls++;
  }

  // Round costs
  const round = (n: number) => Math.round(n * 10000) / 10000;

  return NextResponse.json({
    tenant_id: tenantId,
    period,
    total_cost: round(totalCost),
    total_calls: data.length,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    by_model: Object.fromEntries(
      Object.entries(byModel).map(([k, v]) => [
        k,
        { cost: round(v.cost), calls: v.calls },
      ]),
    ),
    by_channel: Object.fromEntries(
      Object.entries(byChannel).map(([k, v]) => [
        k,
        { cost: round(v.cost), calls: v.calls },
      ]),
    ),
    by_day: Object.fromEntries(
      Object.entries(byDay).map(([k, v]) => [
        k,
        { cost: round(v.cost), calls: v.calls },
      ]),
    ),
  });
}
