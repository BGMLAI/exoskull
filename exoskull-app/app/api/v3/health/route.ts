/**
 * System Health API — Check all dependency statuses.
 *
 * GET: Returns health status of DB, VPS, Anthropic API, Resend, etc.
 * Auth: CRON_SECRET or public (basic health check).
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms?: number;
  error?: string;
}

export async function GET() {
  const checks: HealthCheck[] = [];
  const startTime = Date.now();

  // 1. Supabase DB
  try {
    const dbStart = Date.now();
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("exo_tenants").select("id").limit(1);
    checks.push({
      name: "supabase_db",
      status: error ? "degraded" : "healthy",
      latency_ms: Date.now() - dbStart,
      error: error?.message,
    });
  } catch (err) {
    checks.push({
      name: "supabase_db",
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Supabase RPC functions
  try {
    const rpcStart = Date.now();
    const supabase = getServiceSupabase();
    const { error } = await supabase.rpc("hybrid_search", {
      query_text: "test",
      query_embedding: JSON.stringify(new Array(1536).fill(0)),
      match_tenant_id: "00000000-0000-0000-0000-000000000000",
      match_threshold: 0.01,
      match_count: 1,
      source_types: null,
      recency_weight: 0.1,
      keyword_weight: 0.2,
      vector_weight: 0.7,
    });
    checks.push({
      name: "rpc_hybrid_search",
      status: error ? "degraded" : "healthy",
      latency_ms: Date.now() - rpcStart,
      error: error?.message,
    });
  } catch (err) {
    checks.push({
      name: "rpc_hybrid_search",
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Anthropic API
  try {
    const apiStart = Date.now();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      checks.push({
        name: "anthropic_api",
        status: "down",
        error: "API key not configured",
      });
    } else {
      // Simple connectivity check — don't burn tokens
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      checks.push({
        name: "anthropic_api",
        status: res.ok || res.status === 400 ? "healthy" : "degraded",
        latency_ms: Date.now() - apiStart,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "anthropic_api",
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. API keys presence check
  const keyChecks = [
    { name: "OPENAI_API_KEY", key: process.env.OPENAI_API_KEY },
    { name: "GOOGLE_AI_API_KEY", key: process.env.GOOGLE_AI_API_KEY },
    { name: "TAVILY_API_KEY", key: process.env.TAVILY_API_KEY },
    { name: "GITHUB_TOKEN", key: process.env.GITHUB_TOKEN },
  ];
  for (const { name, key } of keyChecks) {
    checks.push({
      name,
      status: key && !key.startsWith("op://") ? "healthy" : "degraded",
      error: !key ? "not set" : key.startsWith("op://") ? "unresolved 1Password ref" : undefined,
    });
  }

  // 5. Resend (email)
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      checks.push({
        name: "resend_email",
        status: "degraded",
        error: "API key not configured",
      });
    } else {
      const emailStart = Date.now();
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      checks.push({
        name: "resend_email",
        status: res.ok ? "healthy" : "degraded",
        latency_ms: Date.now() - emailStart,
      });
    }
  } catch (err) {
    checks.push({
      name: "resend_email",
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. VPS (code execution)
  try {
    const vpsUrl = process.env.VPS_EXECUTOR_URL;
    if (!vpsUrl) {
      checks.push({
        name: "vps_executor",
        status: "degraded",
        error: "VPS URL not configured",
      });
    } else {
      const vpsStart = Date.now();
      const res = await fetch(`${vpsUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      checks.push({
        name: "vps_executor",
        status: res.ok ? "healthy" : "degraded",
        latency_ms: Date.now() - vpsStart,
      });
    }
  } catch (err) {
    checks.push({
      name: "vps_executor",
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Overall status
  const hasDown = checks.some((c) => c.status === "down");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overallStatus = hasDown ? "down" : hasDegraded ? "degraded" : "healthy";

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - startTime,
      checks,
    },
    { status: overallStatus === "healthy" ? 200 : 503 },
  );
}
