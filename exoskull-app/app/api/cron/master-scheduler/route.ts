/**
 * ExoSkull Master Scheduler
 *
 * Central coordinator for all scheduled jobs.
 * Runs every hour via pg_cron or external trigger.
 *
 * Flow:
 * 1. Get all active scheduled jobs
 * 2. For each job, determine which users should receive it NOW
 * 3. Apply timezone calculations
 * 4. Check rate limits and quiet hours
 * 5. Dispatch to voice/SMS handlers
 * 6. Log results
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isTimeToTrigger,
  isWeekend,
  getDayOfWeek,
  getDayOfMonth,
  isInQuietHours,
  formatLocalTime,
} from "@/lib/cron/timezone-utils";
import {
  dispatchJob,
  type ScheduledJob,
  type UserJobConfig,
} from "@/lib/cron/dispatcher";
import { verifyCronAuth } from "@/lib/cron/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Check if a job should run based on its cron expression
 */
function shouldJobRunNow(job: ScheduledJob, timezone: string): boolean {
  const dayOfWeek = getDayOfWeek(timezone);
  const dayOfMonth = getDayOfMonth(timezone);

  // Check day constraints from cron expression
  const cronParts = job.handler_endpoint.split("/").pop() || "";

  // Weekly jobs: check day of week
  if (job.job_type === "weekly_preview" && dayOfWeek !== 1) return false; // Monday
  if (job.job_type === "weekly_summary" && dayOfWeek !== 5) return false; // Friday
  if (job.job_name === "week_planning" && dayOfWeek !== 0) return false; // Sunday

  // Monthly jobs: check day of month
  if (job.job_name === "monthly_review" && dayOfMonth !== 1) return false;
  if (job.job_name === "goal_checkin" && dayOfMonth !== 15) return false;

  // Check time window
  const targetTime = job.time_window_start;
  return isTimeToTrigger(timezone, targetTime, 10); // 10 min window
}

export async function POST(req: NextRequest) {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  try {
    // Verify cron secret (supports both x-cron-secret header and Bearer token)
    if (!verifyCronAuth(req)) {
      console.log("⚠️ Invalid cron secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    console.log(`🔄 Master Scheduler triggered at ${new Date().toISOString()}`);
    console.log(`   Source: ${body.source || "unknown"}`);

    // Get all active scheduled jobs
    const { data: jobs, error: jobsError } = await supabase
      .from("exo_scheduled_jobs")
      .select("*")
      .eq("is_active", true);

    if (jobsError) {
      console.error("❌ Failed to fetch jobs:", jobsError);
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const results = {
      timestamp: new Date().toISOString(),
      jobs_checked: jobs?.length || 0,
      custom_jobs_checked: 0,
      jobs_triggered: 0,
      users_notified: 0,
      errors: [] as string[],
      details: [] as any[],
    };

    // Process each job
    for (const job of (jobs || []) as ScheduledJob[]) {
      console.log(`\n📋 Checking job: ${job.job_name}`);

      // Get users for this job
      const { data: users, error: usersError } = await supabase.rpc(
        "get_users_for_scheduled_job",
        {
          p_job_name: job.job_name,
          p_current_utc_hour: new Date().getUTCHours(),
        },
      );

      if (usersError) {
        console.error(
          `   ❌ Failed to get users for ${job.job_name}:`,
          usersError,
        );
        results.errors.push(`${job.job_name}: ${usersError.message}`);
        continue;
      }

      let usersTriggered = 0;

      // Process each user
      for (const user of (users || []) as UserJobConfig[]) {
        try {
          const timezone = user.timezone || "Europe/Warsaw";
          const settings = user.schedule_settings || {};

          // Check if job should run for this user NOW
          if (!shouldJobRunNow(job, timezone)) {
            continue;
          }

          console.log(
            `   👤 User ${user.tenant_id} (${timezone}) - ${formatLocalTime(timezone)}`,
          );

          // Check weekend skip
          if (settings.skip_weekends && isWeekend(timezone)) {
            console.log(`      ⏭️ Skipped (weekend)`);
            await logJobExecution(
              job,
              user,
              "skipped",
              null,
              "Weekend skip enabled",
            );
            continue;
          }

          // Check quiet hours
          const quietStart = settings.quiet_hours?.start || "22:00";
          const quietEnd = settings.quiet_hours?.end || "07:00";
          if (isInQuietHours(timezone, quietStart, quietEnd)) {
            console.log(`      ⏭️ Skipped (quiet hours)`);
            await logJobExecution(job, user, "skipped", null, "Quiet hours");
            continue;
          }

          // Check rate limits
          const channel = user.preferred_channel || job.default_channel;
          const { data: withinLimits } = await supabase.rpc(
            "check_user_rate_limit",
            {
              p_tenant_id: user.tenant_id,
              p_channel: channel,
            },
          );

          if (!withinLimits) {
            console.log(`      ⏭️ Skipped (rate limited)`);
            await logJobExecution(job, user, "rate_limited");
            continue;
          }

          // Dispatch the job
          const dispatchResult = await dispatchJob(job, user);

          if (dispatchResult.success) {
            console.log(
              `      ✅ ${dispatchResult.channel.toUpperCase()} sent`,
            );
            usersTriggered++;
            results.users_notified++;
            await logJobExecution(job, user, "completed", dispatchResult);
          } else {
            console.log(`      ❌ Failed: ${dispatchResult.error}`);
            results.errors.push(
              `${job.job_name} for ${user.tenant_id}: ${dispatchResult.error}`,
            );
            await logJobExecution(job, user, "failed", dispatchResult);
          }

          // Small delay between users to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (userError: any) {
          console.error(
            `      ❌ Error for user ${user.tenant_id}:`,
            userError,
          );
          results.errors.push(
            `${job.job_name} for ${user.tenant_id}: ${userError.message}`,
          );
        }
      }

      if (usersTriggered > 0) {
        results.jobs_triggered++;
      }

      results.details.push({
        job_name: job.job_name,
        users_checked: users?.length || 0,
        users_triggered: usersTriggered,
      });
    }

    // Process custom scheduled jobs
    await processCustomScheduledJobs(results);

    const duration = Date.now() - startTime;
    console.log(`\n✅ Master Scheduler complete in ${duration}ms`);
    console.log(`   Jobs: ${results.jobs_triggered}/${results.jobs_checked}`);
    console.log(`   Users notified: ${results.users_notified}`);
    console.log(`   Errors: ${results.errors.length}`);

    return NextResponse.json({
      ...results,
      duration_ms: duration,
    });
  } catch (error) {
    console.error("❌ Master Scheduler fatal error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Log job execution to database
 */
async function logJobExecution(
  job: ScheduledJob,
  user: UserJobConfig,
  status: string,
  result?: any,
  errorMessage?: string,
) {
  try {
    await getServiceSupabase().rpc("log_job_execution", {
      p_job_id: job.id,
      p_job_name: job.job_name,
      p_tenant_id: user.tenant_id,
      p_status: status,
      p_channel:
        result?.channel || user.preferred_channel || job.default_channel,
      p_result: result ? JSON.stringify(result) : null,
      p_error: errorMessage || result?.error || null,
      p_vapi_call_id: result?.call_id || null,
      p_twilio_sid: result?.message_sid || null,
    });
  } catch (error) {
    console.error("Failed to log job execution:", error);
  }
}

/**
 * Process custom user-created scheduled jobs
 */
async function processCustomScheduledJobs(results: {
  custom_jobs_checked: number;
  jobs_triggered: number;
  users_notified: number;
  errors: string[];
  details: any[];
}) {
  try {
    const supabase = getServiceSupabase();
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();

    // Get all enabled custom jobs that should run now
    // We check if the time_of_day hour matches current hour (within cron window)
    const { data: customJobs, error: customError } = await supabase
      .from("exo_custom_scheduled_jobs")
      .select(
        `
        *,
        tenant:exo_tenants!exo_custom_scheduled_jobs_tenant_id_fkey (
          id, phone, timezone, language, name, schedule_settings
        )
      `,
      )
      .eq("is_enabled", true);

    if (customError) {
      console.error("❌ Failed to fetch custom jobs:", customError);
      results.errors.push(`Custom jobs: ${customError.message}`);
      return;
    }

    if (!customJobs || customJobs.length === 0) {
      console.log("📋 No custom jobs to process");
      return;
    }

    results.custom_jobs_checked = customJobs.length;
    console.log(`\n📋 Processing ${customJobs.length} custom jobs`);

    for (const customJob of customJobs) {
      try {
        const tenant = customJob.tenant;
        if (!tenant || !tenant.phone) {
          console.log(`   ⏭️ ${customJob.display_name}: No tenant or phone`);
          continue;
        }

        const timezone = tenant.timezone || "Europe/Warsaw";

        // Check if job should run based on schedule type and current time
        if (!shouldCustomJobRunNow(customJob, timezone)) {
          continue;
        }

        console.log(
          `   👤 Custom job "${customJob.display_name}" for tenant ${tenant.id}`,
        );

        // Check quiet hours
        const settings = tenant.schedule_settings || {};
        const quietStart = settings.quiet_hours?.start || "22:00";
        const quietEnd = settings.quiet_hours?.end || "07:00";
        if (isInQuietHours(timezone, quietStart, quietEnd)) {
          console.log(`      ⏭️ Skipped (quiet hours)`);
          await logCustomJobExecution(
            customJob,
            "skipped",
            null,
            "Quiet hours",
          );
          continue;
        }

        // Check rate limits
        const { data: withinLimits } = await getServiceSupabase().rpc(
          "check_user_rate_limit",
          {
            p_tenant_id: tenant.id,
            p_channel: customJob.channel,
          },
        );

        if (!withinLimits) {
          console.log(`      ⏭️ Skipped (rate limited)`);
          await logCustomJobExecution(customJob, "rate_limited");
          continue;
        }

        // Create a job-like object for dispatcher
        const fakeJob: ScheduledJob = {
          id: customJob.id,
          job_name: customJob.job_name,
          display_name: customJob.display_name,
          job_type: customJob.job_type || "custom",
          time_window_start: customJob.time_of_day,
          time_window_end: customJob.time_of_day,
          default_channel: customJob.channel as "voice" | "sms",
          handler_endpoint: "",
        };

        const userConfig: UserJobConfig = {
          tenant_id: tenant.id,
          phone: tenant.phone,
          timezone,
          language: tenant.language || "pl",
          preferred_channel: customJob.channel,
          custom_time: customJob.time_of_day,
          tenant_name: tenant.name,
          schedule_settings: settings,
        };

        // Dispatch the job
        const dispatchResult = await dispatchJob(fakeJob, userConfig);

        if (dispatchResult.success) {
          console.log(`      ✅ ${dispatchResult.channel.toUpperCase()} sent`);
          results.jobs_triggered++;
          results.users_notified++;
          await logCustomJobExecution(customJob, "completed", dispatchResult);

          // Update last_executed_at
          await getServiceSupabase()
            .from("exo_custom_scheduled_jobs")
            .update({ last_executed_at: new Date().toISOString() })
            .eq("id", customJob.id);
        } else {
          console.log(`      ❌ Failed: ${dispatchResult.error}`);
          results.errors.push(
            `Custom ${customJob.display_name}: ${dispatchResult.error}`,
          );
          await logCustomJobExecution(customJob, "failed", dispatchResult);
        }

        // Small delay between jobs
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (jobError: any) {
        console.error(
          `   ❌ Error processing custom job ${customJob.display_name}:`,
          jobError,
        );
        results.errors.push(
          `Custom ${customJob.display_name}: ${jobError.message}`,
        );
      }
    }
  } catch (error: any) {
    console.error("❌ Failed to process custom jobs:", error);
    results.errors.push(`Custom jobs processing: ${error.message}`);
  }
}

/**
 * Check if a custom job should run based on schedule type and current time
 */
function shouldCustomJobRunNow(job: any, timezone: string): boolean {
  const dayOfWeek = getDayOfWeek(timezone);
  const dayOfMonth = getDayOfMonth(timezone);

  // Check schedule type constraints
  if (job.schedule_type === "weekly") {
    if (!job.days_of_week || !job.days_of_week.includes(dayOfWeek)) {
      return false;
    }
  }

  if (job.schedule_type === "monthly") {
    if (job.day_of_month !== dayOfMonth) {
      return false;
    }
  }

  // Check time window (within 10 minutes of target time)
  const targetTime = job.time_of_day;
  return isTimeToTrigger(timezone, targetTime, 10);
}

/**
 * Log custom job execution to database
 */
async function logCustomJobExecution(
  job: any,
  status: string,
  result?: any,
  errorMessage?: string,
) {
  try {
    await getServiceSupabase()
      .from("exo_custom_job_logs")
      .insert({
        job_id: job.id,
        tenant_id: job.tenant_id,
        status,
        channel_used: result?.channel || job.channel,
        result: result ? result : null,
        error_message: errorMessage || result?.error || null,
      });
  } catch (error) {
    console.error("Failed to log custom job execution:", error);
  }
}

/**
 * GET endpoint for manual testing / status check
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    // Get all jobs with consent info
    const { data: jobs } = await supabase
      .from("exo_scheduled_jobs")
      .select(
        "job_name, display_name, job_type, time_window_start, default_channel, is_active, is_system, requires_user_consent",
      )
      .order("time_window_start");

    // Separate system and user jobs
    const systemJobs =
      jobs?.filter((j) => j.is_system || !j.requires_user_consent) || [];
    const userJobs =
      jobs?.filter((j) => !j.is_system && j.requires_user_consent) || [];

    // Get recent logs
    const { data: recentLogs } = await supabase
      .from("exo_scheduled_job_logs")
      .select("job_name, status, channel_used, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      status: "ok",
      system_jobs: systemJobs,
      user_jobs: userJobs,
      recent_executions: recentLogs || [],
      next_run: "Hourly at minute 0",
      note: "System jobs run automatically. User jobs require consent via conversation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
