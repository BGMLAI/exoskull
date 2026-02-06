/**
 * Custom Scheduled Jobs API
 *
 * POST /api/schedule/custom - Create custom job
 * GET /api/schedule/custom - List user's custom jobs
 * PUT /api/schedule/custom - Update custom job
 * DELETE /api/schedule/custom - Delete custom job
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

interface CustomJobInput {
  tenant_id: string;
  job_name: string;
  display_name: string;
  description?: string;
  schedule_type: "daily" | "weekly" | "monthly";
  time_of_day: string; // HH:MM format
  days_of_week?: number[]; // 0-6 for weekly
  day_of_month?: number; // 1-31 for monthly
  channel: "voice" | "sms";
  message_template?: string;
  job_type?: "reminder" | "check_in" | "follow_up" | "custom";
  is_enabled?: boolean;
}

/**
 * GET /api/schedule/custom
 * List user's custom scheduled jobs
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const tenantId = req.nextUrl.searchParams.get("tenant_id");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    // Get all custom jobs for user
    const { data: jobs, error: jobsError } = await supabase
      .from("exo_custom_scheduled_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("[CustomJobs GET] Error:", jobsError);
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    // Get recent logs for these jobs
    const jobIds = jobs?.map((j) => j.id) || [];
    let recentLogs: any[] = [];

    if (jobIds.length > 0) {
      const { data: logs } = await supabase
        .from("exo_custom_job_logs")
        .select("job_id, status, channel_used, executed_at")
        .in("job_id", jobIds)
        .order("executed_at", { ascending: false })
        .limit(20);

      recentLogs = logs || [];
    }

    return NextResponse.json({
      jobs: jobs || [],
      recent_logs: recentLogs,
    });
  } catch (error) {
    console.error("[CustomJobs GET] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/schedule/custom
 * Create a new custom scheduled job
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body: CustomJobInput = await req.json();

    // Validate required fields
    if (!body.tenant_id || !body.job_name || !body.display_name) {
      return NextResponse.json(
        {
          error: "tenant_id, job_name, and display_name are required",
        },
        { status: 400 },
      );
    }

    // Validate schedule_type specific fields
    if (
      body.schedule_type === "weekly" &&
      (!body.days_of_week || body.days_of_week.length === 0)
    ) {
      return NextResponse.json(
        {
          error: "days_of_week required for weekly schedule",
        },
        { status: 400 },
      );
    }

    if (body.schedule_type === "monthly" && !body.day_of_month) {
      return NextResponse.json(
        {
          error: "day_of_month required for monthly schedule",
        },
        { status: 400 },
      );
    }

    // Sanitize job_name (lowercase, no spaces)
    const sanitizedJobName = body.job_name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    const { data, error } = await supabase
      .from("exo_custom_scheduled_jobs")
      .insert({
        tenant_id: body.tenant_id,
        job_name: sanitizedJobName,
        display_name: body.display_name,
        description: body.description || null,
        schedule_type: body.schedule_type || "daily",
        time_of_day: body.time_of_day || "09:00:00",
        days_of_week: body.days_of_week || null,
        day_of_month: body.day_of_month || null,
        channel: body.channel || "sms",
        message_template: body.message_template || null,
        job_type: body.job_type || "reminder",
        is_enabled: body.is_enabled ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("[CustomJobs POST] Error:", error);

      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error: "Job with this name already exists",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        job: data,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[CustomJobs POST] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/schedule/custom
 * Update an existing custom scheduled job
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await req.json();
    const { tenant_id, job_id, updates } = body;

    if (!tenant_id || !job_id) {
      return NextResponse.json(
        {
          error: "tenant_id and job_id are required",
        },
        { status: 400 },
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};

    if (updates.display_name !== undefined)
      updateData.display_name = updates.display_name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.schedule_type !== undefined)
      updateData.schedule_type = updates.schedule_type;
    if (updates.time_of_day !== undefined)
      updateData.time_of_day = updates.time_of_day;
    if (updates.days_of_week !== undefined)
      updateData.days_of_week = updates.days_of_week;
    if (updates.day_of_month !== undefined)
      updateData.day_of_month = updates.day_of_month;
    if (updates.channel !== undefined) updateData.channel = updates.channel;
    if (updates.message_template !== undefined)
      updateData.message_template = updates.message_template;
    if (updates.job_type !== undefined) updateData.job_type = updates.job_type;
    if (updates.is_enabled !== undefined)
      updateData.is_enabled = updates.is_enabled;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          error: "No updates provided",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("exo_custom_scheduled_jobs")
      .update(updateData)
      .eq("id", job_id)
      .eq("tenant_id", tenant_id) // Ensure user owns the job
      .select()
      .single();

    if (error) {
      console.error("[CustomJobs PUT] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        {
          error: "Job not found or not owned by user",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      job: data,
    });
  } catch (error) {
    console.error("[CustomJobs PUT] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/schedule/custom
 * Delete a custom scheduled job
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const tenantId = req.nextUrl.searchParams.get("tenant_id");
    const jobId = req.nextUrl.searchParams.get("job_id");

    if (!tenantId || !jobId) {
      return NextResponse.json(
        {
          error: "tenant_id and job_id are required",
        },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("exo_custom_scheduled_jobs")
      .delete()
      .eq("id", jobId)
      .eq("tenant_id", tenantId); // Ensure user owns the job

    if (error) {
      console.error("[CustomJobs DELETE] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Job deleted",
    });
  } catch (error) {
    console.error("[CustomJobs DELETE] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
