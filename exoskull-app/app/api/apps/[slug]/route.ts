/**
 * GET /api/apps/[slug] — Serve generated app HTML
 *
 * Public endpoint (no auth). Reads generated app HTML from
 * exo_organism_knowledge (category: "generated_app", source: slug)
 * and returns it as text/html.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Find the most recent generated app with this slug
  const { data, error } = await supabase
    .from("exo_organism_knowledge")
    .select("content")
    .eq("category", "generated_app")
    .eq("source", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff"><h1>App not found</h1></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new Response(data.content, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
