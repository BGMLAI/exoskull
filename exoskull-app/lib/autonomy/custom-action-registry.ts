/**
 * Custom Action Registry — handlers for dynamic actions
 * (toggle_automation, adjust_schedule, set_quiet_hours, etc.)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
export type CustomActionHandler = (
  tenantId: string,
  params: Record<string, unknown>,
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export interface CustomActionEntry {
  description: string;
  handler: CustomActionHandler;
}

export function buildCustomActionRegistry(
  supabase: SupabaseClient,
): Record<string, CustomActionEntry> {
  return {
    toggle_automation: {
      description: "Enable or disable a custom scheduled job",
      handler: async (tenantId, params) => {
        const { automationId, enabled } = params as {
          automationId: string;
          enabled: boolean;
        };
        if (!automationId || enabled === undefined) {
          return {
            success: false,
            error: "Missing automationId or enabled parameter",
          };
        }
        const { data, error } = await supabase
          .from("exo_custom_scheduled_jobs")
          .update({ is_enabled: enabled })
          .eq("id", automationId)
          .eq("tenant_id", tenantId)
          .select("id, display_name, is_enabled")
          .single();
        if (error) return { success: false, error: error.message };
        if (!data)
          return {
            success: false,
            error: "Automation not found or not owned by tenant",
          };
        return {
          success: true,
          data: {
            automationId: data.id,
            displayName: data.display_name,
            enabled: data.is_enabled,
          },
        };
      },
    },

    adjust_schedule: {
      description: "Update schedule of a custom job (time, frequency, days)",
      handler: async (tenantId, params) => {
        const {
          automationId,
          time_of_day,
          schedule_type,
          days_of_week,
          day_of_month,
        } = params as {
          automationId: string;
          time_of_day?: string;
          schedule_type?: string;
          days_of_week?: number[];
          day_of_month?: number;
        };
        if (!automationId)
          return { success: false, error: "Missing automationId" };

        const updateData: Record<string, unknown> = {};
        if (time_of_day !== undefined) updateData.time_of_day = time_of_day;
        if (schedule_type !== undefined)
          updateData.schedule_type = schedule_type;
        if (days_of_week !== undefined) updateData.days_of_week = days_of_week;
        if (day_of_month !== undefined) updateData.day_of_month = day_of_month;

        if (Object.keys(updateData).length === 0) {
          return { success: false, error: "No schedule changes provided" };
        }

        const { data, error } = await supabase
          .from("exo_custom_scheduled_jobs")
          .update(updateData)
          .eq("id", automationId)
          .eq("tenant_id", tenantId)
          .select("id, display_name, schedule_type, time_of_day, days_of_week")
          .single();
        if (error) return { success: false, error: error.message };
        if (!data)
          return {
            success: false,
            error: "Automation not found or not owned by tenant",
          };
        return { success: true, data };
      },
    },

    set_quiet_hours: {
      description: "Update quiet hours in tenant schedule_settings",
      handler: async (tenantId, params) => {
        const { start, end } = params as { start?: string; end?: string };
        if (!start && !end) {
          return {
            success: false,
            error: "Provide start and/or end time (HH:MM format)",
          };
        }

        const { data: tenant, error: readError } = await supabase
          .from("exo_tenants")
          .select("schedule_settings")
          .eq("id", tenantId)
          .single();
        if (readError) return { success: false, error: readError.message };

        const settings =
          (tenant?.schedule_settings as Record<string, unknown>) || {};
        const quietHours = (settings.quiet_hours as Record<string, string>) || {
          start: "22:00",
          end: "07:00",
        };
        if (start) quietHours.start = start;
        if (end) quietHours.end = end;
        settings.quiet_hours = quietHours;

        const { error: updateError } = await supabase
          .from("exo_tenants")
          .update({ schedule_settings: settings })
          .eq("id", tenantId);
        if (updateError) return { success: false, error: updateError.message };
        return { success: true, data: { quiet_hours: quietHours } };
      },
    },

    update_preference: {
      description:
        "Update a user preference (language, timezone, or schedule setting)",
      handler: async (tenantId, params) => {
        const { key, value } = params as { key: string; value: unknown };
        if (!key) return { success: false, error: "Missing key parameter" };

        const scheduleKeys = [
          "skip_weekends",
          "notification_channels",
          "rate_limits",
        ];
        if (scheduleKeys.includes(key)) {
          const { data: tenant } = await supabase
            .from("exo_tenants")
            .select("schedule_settings")
            .eq("id", tenantId)
            .single();
          const settings =
            (tenant?.schedule_settings as Record<string, unknown>) || {};
          settings[key] = value;
          const { error } = await supabase
            .from("exo_tenants")
            .update({ schedule_settings: settings })
            .eq("id", tenantId);
          if (error) return { success: false, error: error.message };
          return { success: true, data: { key, value } };
        }

        const directKeys = ["language", "timezone", "name"];
        if (directKeys.includes(key)) {
          const { error } = await supabase
            .from("exo_tenants")
            .update({ [key]: value })
            .eq("id", tenantId);
          if (error) return { success: false, error: error.message };
          return { success: true, data: { key, value } };
        }

        return { success: false, error: `Unknown preference key: ${key}` };
      },
    },

    archive_completed_tasks: {
      description: "Archive completed tasks older than N days",
      handler: async (tenantId, params) => {
        const { olderThanDays } = params as { olderThanDays?: number };
        const cutoffDays = olderThanDays || 7;
        const cutoffDate = new Date(
          Date.now() - cutoffDays * 24 * 60 * 60 * 1000,
        );

        try {
          const { getTasks, updateTask } =
            await import("@/lib/tasks/task-service");
          const doneTasks = await getTasks(
            tenantId,
            { status: "done" },
            supabase,
          );

          const toArchive = doneTasks.filter(
            (t) => t.completed_at && new Date(t.completed_at) < cutoffDate,
          );

          let archivedCount = 0;
          for (const task of toArchive) {
            const result = await updateTask(
              task.id,
              tenantId,
              { status: "archived" as never },
              supabase,
            );
            if (result.success) archivedCount++;
          }

          return {
            success: true,
            data: { archivedCount, cutoffDays },
          };
        } catch (error) {
          logger.error("[CustomAction] archive_completed_tasks failed:", {
            error: error instanceof Error ? error.message : String(error),
            tenantId,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : "Archive failed",
          };
        }
      },
    },
  };
}
