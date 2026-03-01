/**
 * GET /api/v3/health — Diagnose tool dependencies
 *
 * Tests: Supabase tables, Anthropic API, OpenAI API, GitHub API
 * Returns JSON with pass/fail for each dependency.
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function check(
  name: string,
  fn: () => Promise<unknown>,
): Promise<{ name: string; ok: boolean; error?: string; ms: number }> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

export async function GET() {
  const supabase = getServiceSupabase();

  const results = await Promise.all([
    // Supabase tables
    check("supabase_connection", async () => {
      const { error } = await supabase
        .from("exo_tenants")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),
    check("exo_organism_knowledge", async () => {
      const { error } = await supabase
        .from("exo_organism_knowledge")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),
    check("exo_user_documents", async () => {
      const { error } = await supabase
        .from("exo_user_documents")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),
    check("user_notes", async () => {
      const { error } = await supabase.from("user_notes").select("id").limit(1);
      if (error) throw new Error(error.message);
    }),
    check("exo_unified_messages", async () => {
      const { error } = await supabase
        .from("exo_unified_messages")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),
    check("exo_source_modifications", async () => {
      const { error } = await supabase
        .from("exo_source_modifications")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),
    check("exo_autonomy_log", async () => {
      const { error } = await supabase
        .from("exo_autonomy_log")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    }),

    // RPC functions
    check("rpc_hybrid_search", async () => {
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
      if (error) throw new Error(error.message);
    }),
    check("rpc_vector_search", async () => {
      const { error } = await supabase.rpc("vector_search", {
        query_embedding: JSON.stringify(new Array(1536).fill(0)),
        match_tenant_id: "00000000-0000-0000-0000-000000000000",
        match_threshold: 0.01,
        match_count: 1,
        source_types: null,
      });
      if (error) throw new Error(error.message);
    }),

    // API keys
    check("ANTHROPIC_API_KEY", async () => {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("not set");
      if (key.startsWith("op://")) throw new Error("unresolved 1Password ref");
      // Quick validation: list models
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body.slice(0, 200)}`);
      }
    }),

    check("OPENAI_API_KEY", async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("not set");
      if (key.startsWith("op://")) throw new Error("unresolved 1Password ref");
    }),

    check("GOOGLE_AI_API_KEY", async () => {
      const key = process.env.GOOGLE_AI_API_KEY;
      if (!key) throw new Error("not set (query expansion/reranking disabled)");
    }),

    check("TAVILY_API_KEY", async () => {
      const key = process.env.TAVILY_API_KEY;
      if (!key) throw new Error("not set (web search disabled)");
    }),

    check("GITHUB_TOKEN", async () => {
      const token = process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO;
      if (!token) throw new Error("GITHUB_TOKEN not set");
      if (!repo) throw new Error("GITHUB_REPO not set");
      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
    }),
  ]);

  const allOk = results.every((r) => r.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
