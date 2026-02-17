/**
 * Schedule Preferences API
 *
 * GET /api/schedule - Get user's schedule preferences
 * PUT /api/schedule - Update user's schedule preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/schedule
 * Get all scheduled jobs with user's preferences
 */
export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();

    // Get all active jobs
    const { data: jobs, error: jobsError } = await supabase
      .from("exo_scheduled_jobs")
      .select("*")
      .eq("is_active", true)
      .order("time_window_start");

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    // Get user's preferences for each job
    const { data: preferences, error: prefsError } = await supabase
      .from("exo_user_job_preferences")
      .select("*")
      .eq("tenant_id", tenantId);

    if (prefsError) {
      return NextResponse.json({ error: prefsError.message }, { status: 500 });
    }

    // Get user's global schedule settings
    const { data: tenant, error: tenantError } = await supabase
      .from("exo_tenants")
      .select("timezone, language, schedule_settings")
      .eq("id", tenantId)
      .single();

    if (tenantError && tenantError.code !== "PGRST116") {
      return NextResponse.json({ error: tenantError.message }, { status: 500 });
    }

    // Merge jobs with user preferences
    const prefsMap = new Map(preferences?.map((p) => [p.job_id, p]) || []);
    const jobsWithPrefs = jobs?.map((job) => ({
      ...job,
      user_preference: prefsMap.get(job.id) || {
        is_enabled: true,
        custom_time: null,
        preferred_channel: null,
        skip_weekends: false,
      },
    }));

    // Get recent execution logs
    const { data: recentLogs } = await supabase
      .from("exo_scheduled_job_logs")
      .select("job_name, status, channel_used, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      jobs: jobsWithPrefs,
      global_settings: {
        timezone: tenant?.timezone || "Europe/Warsaw",
        language: tenant?.language || "pl",
        ...tenant?.schedule_settings,
      },
      recent_logs: recentLogs || [],
    });
  } catch (error) {
    console.error("GET /api/schedule error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/schedule
 * Update user's job preference or global settings
 */
export const PUT = withApiLog(async function PUT(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await req.json();
    const { job_id, preference, global_settings } = body;

    // Update job preference
    if (job_id && preference) {
      const { data, error } = await supabase
        .from("exo_user_job_preferences")
        .upsert(
          {
            tenant_id: tenantId,
            job_id,
            is_enabled: preference.is_enabled ?? true,
            custom_time: preference.custom_time || null,
            preferred_channel: preference.preferred_channel || null,
            skip_weekends: preference.skip_weekends ?? false,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "tenant_id,job_id",
          },
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, preference: data });
    }

    // Update global settings
    if (global_settings) {
      const { data, error } = await supabase
        .from("exo_tenants")
        .update({
          timezone: global_settings.timezone,
          language: global_settings.language,
          schedule_settings: {
            notification_channels: global_settings.notification_channels,
            rate_limits: global_settings.rate_limits,
            quiet_hours: global_settings.quiet_hours,
            skip_weekends: global_settings.skip_weekends,
          },
        })
        .eq("id", tenantId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, settings: data });
    }

    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  } catch (error) {
    console.error("PUT /api/schedule error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});

/**
 * POST /api/schedule
 * Manually trigger a specific job (for testing)
 */
export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await req.json();
    const { job_name, channel } = body;

    if (!job_name) {
      return NextResponse.json({ error: "job_name required" }, { status: 400 });
    }

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from("exo_scheduled_jobs")
      .select("*")
      .eq("job_name", job_name)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get the user
    const { data: tenant, error: tenantError } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Import dispatcher dynamically to avoid circular deps
    const { dispatchJob, dispatchVoiceCall, dispatchSms } =
      await import("@/lib/cron/dispatcher");

    const user = {
      tenant_id: tenant.id,
      phone: tenant.phone,
      timezone: tenant.timezone || "Europe/Warsaw",
      language: tenant.language || "pl",
      preferred_channel: channel || job.default_channel,
      custom_time: null,
      tenant_name: tenant.name,
      schedule_settings: tenant.schedule_settings,
    };

    // Dispatch based on channel
    let result;
    if (channel === "voice") {
      result = await dispatchVoiceCall(job, user);
    } else if (channel === "sms") {
      result = await dispatchSms(job, user);
    } else {
      result = await dispatchJob(job, user);
    }

    // Log the execution
    await supabase.rpc("log_job_execution", {
      p_job_id: job.id,
      p_job_name: job.job_name,
      p_tenant_id: tenantId,
      p_status: result.success ? "completed" : "failed",
      p_channel: result.channel,
      p_result: JSON.stringify(result),
      p_error: result.error || null,
      p_vapi_call_id: result.call_id || null,
      p_twilio_sid: result.message_sid || null,
    });

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error) {
    console.error("POST /api/schedule error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
