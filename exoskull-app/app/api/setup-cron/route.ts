/**
 * Setup CRON System
 *
 * POST /api/setup-cron
 *
 * Creates the scheduled jobs tables and inserts default jobs.
 * Uses direct table operations instead of raw SQL execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
  try {
    // Require CRON_SECRET or admin auth
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();

    const results: any[] = [];

    // Step 1: Check if tables exist by trying to select from them
    console.log("📋 Checking existing tables...");

    const { error: checkJobsError } = await supabase
      .from("exo_scheduled_jobs")
      .select("id")
      .limit(1);

    if (checkJobsError && checkJobsError.code === "42P01") {
      // Table doesn't exist - need to run SQL migration manually
      return NextResponse.json(
        {
          success: false,
          message:
            "Tables not created yet. Please run the SQL migration in Supabase Dashboard.",
          instructions: [
            "1. Go to Supabase Dashboard > SQL Editor",
            "2. Copy the content of supabase/migrations/20260201000002_scheduled_jobs_system.sql",
            "3. Run the SQL",
            "4. Call this endpoint again to verify",
          ],
          migration_file:
            "supabase/migrations/20260201000002_scheduled_jobs_system.sql",
        },
        { status: 400 },
      );
    }

    results.push({ step: "check_tables", status: "exists" });

    // Step 2: Insert/update default jobs
    console.log("📝 Inserting default scheduled jobs...");

    const defaultJobs = [
      {
        job_name: "morning_checkin",
        display_name: "Morning Check-in",
        description:
          'Daily morning wellness check: "Jak się czujesz? Energia 1-10?"',
        cron_expression: "0 * * * *",
        job_type: "morning_checkin",
        handler_endpoint: "/api/cron/morning-checkin",
        time_window_start: "06:00",
        time_window_end: "10:00",
        default_channel: "voice",
      },
      {
        job_name: "day_summary",
        display_name: "Day Summary",
        description: "Summary of calendar and priorities for the day",
        cron_expression: "0 * * * *",
        job_type: "day_summary",
        handler_endpoint: "/api/cron/day-summary",
        time_window_start: "08:00",
        time_window_end: "11:00",
        default_channel: "sms",
      },
      {
        job_name: "meal_reminder",
        display_name: "Meal Reminder",
        description: "Remind to log meal if not logged",
        cron_expression: "0 * * * *",
        job_type: "midday_reminder",
        handler_endpoint: "/api/cron/meal-reminder",
        time_window_start: "11:00",
        time_window_end: "14:00",
        default_channel: "sms",
      },
      {
        job_name: "evening_reflection",
        display_name: "Evening Reflection",
        description: 'Daily reflection: "Jak minął dzień?"',
        cron_expression: "0 * * * *",
        job_type: "evening_checkin",
        handler_endpoint: "/api/cron/evening-reflection",
        time_window_start: "20:00",
        time_window_end: "22:00",
        default_channel: "voice",
      },
      {
        job_name: "bedtime_reminder",
        display_name: "Bedtime Reminder",
        description: "Reminder for sleep goal",
        cron_expression: "30 * * * *",
        job_type: "bedtime_reminder",
        handler_endpoint: "/api/cron/bedtime-reminder",
        time_window_start: "21:30",
        time_window_end: "23:00",
        default_channel: "sms",
      },
      {
        job_name: "week_preview",
        display_name: "Week Preview",
        description: "Monday morning week planning",
        cron_expression: "0 * * * 1",
        job_type: "weekly_preview",
        handler_endpoint: "/api/cron/week-preview",
        time_window_start: "07:00",
        time_window_end: "10:00",
        default_channel: "voice",
      },
      {
        job_name: "week_summary",
        display_name: "Week Summary",
        description: "Friday afternoon week review",
        cron_expression: "0 * * * 5",
        job_type: "weekly_summary",
        handler_endpoint: "/api/cron/week-summary",
        time_window_start: "16:00",
        time_window_end: "19:00",
        default_channel: "voice",
      },
      {
        job_name: "week_planning",
        display_name: "Week Planning Call",
        description: "Optional Sunday evening planning session",
        cron_expression: "0 * * * 0",
        job_type: "weekly_summary",
        handler_endpoint: "/api/cron/week-planning",
        time_window_start: "18:00",
        time_window_end: "21:00",
        default_channel: "voice",
      },
      {
        job_name: "monthly_review",
        display_name: "Monthly Review",
        description: "1st of month comprehensive review",
        cron_expression: "0 * 1 * *",
        job_type: "monthly_review",
        handler_endpoint: "/api/cron/monthly-review",
        time_window_start: "09:00",
        time_window_end: "12:00",
        default_channel: "voice",
      },
      {
        job_name: "goal_checkin",
        display_name: "Mid-Month Goal Check",
        description: "15th of month goal progress check",
        cron_expression: "0 * 15 * *",
        job_type: "monthly_review",
        handler_endpoint: "/api/cron/goal-checkin",
        time_window_start: "09:00",
        time_window_end: "12:00",
        default_channel: "sms",
      },
    ];

    for (const job of defaultJobs) {
      const { error } = await supabase
        .from("exo_scheduled_jobs")
        .upsert(job, { onConflict: "job_name" });

      if (error) {
        results.push({
          step: `insert_job_${job.job_name}`,
          status: "error",
          error: error.message,
        });
      } else {
        results.push({ step: `insert_job_${job.job_name}`, status: "success" });
      }
    }

    // Step 3: Verify jobs were inserted
    const { data: jobs, error: listError } = await supabase
      .from("exo_scheduled_jobs")
      .select("job_name, display_name, time_window_start, default_channel")
      .order("time_window_start");

    if (listError) {
      return NextResponse.json(
        {
          success: false,
          error: listError.message,
          results,
        },
        { status: 500 },
      );
    }

    console.log(`✅ Setup complete. ${jobs?.length || 0} jobs configured.`);

    return NextResponse.json({
      success: true,
      message: `CRON system setup complete. ${jobs?.length || 0} scheduled jobs configured.`,
      jobs: jobs || [],
      results,
    });
  } catch (error) {
    console.error("Setup CRON error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/setup-cron - Check setup status
 */
export async function GET(req: NextRequest) {
  // Require CRON_SECRET — same as POST handler
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Check if tables exist
    const { data: jobs, error: jobsError } = await supabase
      .from("exo_scheduled_jobs")
      .select(
        "job_name, display_name, time_window_start, default_channel, is_active",
      )
      .order("time_window_start");

    if (jobsError) {
      return NextResponse.json({
        status: "not_setup",
        error: jobsError.message,
        instructions: [
          "1. Go to Supabase Dashboard > SQL Editor",
          "2. Run the migration: supabase/migrations/20260201000002_scheduled_jobs_system.sql",
          "3. POST /api/setup-cron to insert default jobs",
        ],
      });
    }

    // Check for helper functions
    const { data: functions } = await supabase
      .rpc("get_users_for_scheduled_job", {
        p_job_name: "morning_checkin",
        p_current_utc_hour: new Date().getUTCHours(),
      })
      .limit(0);

    const hasFunctions = functions !== null;

    return NextResponse.json({
      status: "ready",
      tables: {
        exo_scheduled_jobs: true,
        functions: hasFunctions,
      },
      jobs: jobs || [],
      jobs_count: jobs?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
