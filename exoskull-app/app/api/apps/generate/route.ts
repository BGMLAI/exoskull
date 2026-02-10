/**
 * POST /api/apps/generate — Generate a new custom app from description
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateApp } from "@/lib/apps/generator/app-generator";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { description } = await request.json();

    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length < 5
    ) {
      return NextResponse.json(
        { error: "Description must be at least 5 characters" },
        { status: 400 },
      );
    }

    const result = await generateApp({
      tenant_id: user.id,
      description: description.trim(),
      source: "user_request",
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ app: result.app }, { status: 201 });
  } catch (error) {
    console.error("[AppGenerate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
