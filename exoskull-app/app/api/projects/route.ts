/**
 * Projects API
 *
 * GET /api/projects - List user's projects
 * POST /api/projects - Create a new project
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET() {
  try {
    // Get authenticated user
    const serverSupabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: projects, error } = await supabase
      .from("exo_projects")
      .select("id, name, description, status, color, icon, created_at")
      .eq("tenant_id", user.id)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[Projects API] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      projects: projects || [],
    });
  } catch (error) {
    console.error("[Projects API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const serverSupabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, color, icon } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();

    const { data: project, error } = await supabase
      .from("exo_projects")
      .insert({
        tenant_id: user.id,
        name: name.trim(),
        description: description || null,
        color: color || "#6366f1",
        icon: icon || null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("[Projects API] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error("[Projects API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
