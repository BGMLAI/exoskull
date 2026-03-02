/**
 * System Health API — Check all dependency statuses.
 *
 * GET: Returns health status of DB, VPS, Anthropic API, Resend, etc.
 * Auth: CRON_SECRET or public (basic health check).
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const maxDuration = 30;

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms?: number;
  error?: string;
}

export async function GET(req: Request) {
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

  // 2. Anthropic API
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

  // 3. Resend (email)
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

  // 4. VPS (code execution)
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

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    total_latency_ms: Date.now() - startTime,
    checks,
  });
}
