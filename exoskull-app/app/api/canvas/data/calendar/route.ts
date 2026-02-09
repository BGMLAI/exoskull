/**
 * Canvas Calendar Data API
 *
 * GET /api/canvas/data/calendar — Returns upcoming events for CalendarWidget.
 * Aggregates scheduled jobs, task deadlines, and scheduled interventions.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CalendarItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    const [scheduledJobs, taskDeadlines, interventions] = await Promise.all([
      // Upcoming scheduled check-ins / jobs
      supabase
        .from("exo_custom_scheduled_jobs")
        .select("id, display_name, next_execution_at, job_type, recurrence")
        .eq("tenant_id", user.id)
        .eq("is_enabled", true)
        .gt("next_execution_at", now)
        .order("next_execution_at", { ascending: true })
        .limit(5),

      // Task deadlines
      supabase
        .from("exo_tasks")
        .select("id, title, due_date, status, priority")
        .eq("tenant_id", user.id)
        .neq("status", "done")
        .not("due_date", "is", null)
        .gt("due_date", now)
        .order("due_date", { ascending: true })
        .limit(5),

      // Scheduled interventions
      supabase
        .from("exo_interventions")
        .select("id, title, scheduled_for, intervention_type")
        .eq("tenant_id", user.id)
        .in("status", ["scheduled", "approved"])
        .not("scheduled_for", "is", null)
        .gt("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .limit(3),
    ]);

    const items: CalendarItem[] = [];

    // Map scheduled jobs
    for (const job of scheduledJobs.data || []) {
      items.push({
        id: job.id,
        title: job.display_name || job.job_type,
        date: job.next_execution_at,
        type: "checkin",
        link: "/dashboard/settings",
        meta: job.recurrence || undefined,
      });
    }

    // Map task deadlines
    for (const task of taskDeadlines.data || []) {
      items.push({
        id: task.id,
        title: task.title,
        date: task.due_date,
        type: "task",
        link: "/dashboard/tasks",
        meta: task.priority || undefined,
      });
    }

    // Map scheduled interventions
    for (const intv of interventions.data || []) {
      items.push({
        id: intv.id,
        title: intv.title,
        date: intv.scheduled_for,
        type: "custom",
        link: "/dashboard",
        meta: intv.intervention_type || undefined,
      });
    }

    // Sort all items by date, take top 10
    items.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return NextResponse.json({ items: items.slice(0, 10) });
  } catch (error) {
    console.error("[Canvas] Calendar data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
