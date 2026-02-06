// =====================================================
// CALENDAR TOOL - Google Calendar via Workspace Rig
// =====================================================

import {
  ExoTool,
  ToolHandler,
  ToolResult,
  stringParam,
  numberParam,
} from "./types";
import { createGoogleWorkspaceClient } from "../rigs/google-workspace/client";
import { getServiceSupabase } from "@/lib/supabase/service";

// =====================================================
// TOOL DEFINITION
// =====================================================

export const calendarTool: ExoTool = {
  name: "calendar",
  description:
    "Manage Google Calendar events. Get upcoming events, today's schedule, create new events, or check availability.",
  parameters: {
    type: "object",
    properties: {
      action: stringParam("Action to perform", {
        enum: ["get_events", "get_today", "create_event", "check_free_busy"],
      }),
      // For get_events
      start_date: stringParam("Start date in YYYY-MM-DD format"),
      end_date: stringParam("End date in YYYY-MM-DD format"),
      max_results: numberParam("Maximum number of events to return", {
        default: 10,
      }),
      // For create_event
      title: stringParam("Event title/summary"),
      description: stringParam("Event description"),
      start_time: stringParam(
        "Start time in ISO 8601 format (e.g., 2024-01-15T10:00:00)",
      ),
      end_time: stringParam("End time in ISO 8601 format"),
      location: stringParam("Event location"),
      attendees: stringParam("Comma-separated list of attendee emails"),
      // For check_free_busy
      check_start: stringParam("Start of availability check period (ISO 8601)"),
      check_end: stringParam("End of availability check period (ISO 8601)"),
    },
    required: ["action"],
  },
};

// =====================================================
// HELPER: Get Google Workspace Client
// =====================================================

async function getWorkspaceClient(tenantId: string) {
  const { data: connection, error } = await getServiceSupabase()
    .from("exo_rig_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("rig_type", "google-workspace")
    .single();

  if (error || !connection) {
    return null;
  }

  return createGoogleWorkspaceClient(connection);
}

// =====================================================
// HANDLER
// =====================================================

export const calendarHandler: ToolHandler = async (
  context,
  params,
): Promise<ToolResult> => {
  const {
    action,
    start_date,
    end_date,
    max_results,
    title,
    description,
    start_time,
    end_time,
    location,
    attendees,
    check_start,
    check_end,
  } = params as {
    action: string;
    start_date?: string;
    end_date?: string;
    max_results?: number;
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    attendees?: string;
    check_start?: string;
    check_end?: string;
  };

  try {
    const client = await getWorkspaceClient(context.tenant_id);

    if (!client) {
      return {
        success: false,
        error:
          "Google Workspace not connected. Please connect your Google account first.",
      };
    }

    switch (action) {
      case "get_events": {
        const timeMin = start_date
          ? new Date(start_date).toISOString()
          : new Date().toISOString();
        const timeMax = end_date
          ? new Date(end_date + "T23:59:59").toISOString()
          : undefined;

        const events = await client.getUpcomingEvents(
          "primary",
          max_results || 10,
        );

        return {
          success: true,
          result: {
            events: events.map((e) => ({
              id: e.id,
              title: e.summary,
              description: e.description,
              start: e.start.dateTime || e.start.date,
              end: e.end.dateTime || e.end.date,
              location: e.location,
              attendees: e.attendees?.map((a) => a.email) || [],
            })),
            count: events.length,
          },
        };
      }

      case "get_today": {
        const events = await client.getTodaysEvents();

        return {
          success: true,
          result: {
            events: events.map((e) => ({
              id: e.id,
              title: e.summary,
              description: e.description,
              start: e.start.dateTime || e.start.date,
              end: e.end.dateTime || e.end.date,
              location: e.location,
            })),
            count: events.length,
            date: new Date().toISOString().split("T")[0],
          },
        };
      }

      case "create_event": {
        if (!title || !start_time || !end_time) {
          return {
            success: false,
            error:
              "Title, start_time, and end_time are required to create an event",
          };
        }

        const attendeeList = attendees
          ? attendees.split(",").map((email) => ({
              email: email.trim(),
              responseStatus: "needsAction",
            }))
          : undefined;

        const event = await client.createEvent("primary", {
          summary: title,
          description,
          start: { dateTime: start_time },
          end: { dateTime: end_time },
          location,
          attendees: attendeeList,
        });

        return {
          success: true,
          result: {
            event_id: event.id,
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            message: "Event created successfully",
          },
        };
      }

      case "check_free_busy": {
        if (!check_start || !check_end) {
          return {
            success: false,
            error:
              "check_start and check_end are required for availability check",
          };
        }

        const freeBusy = await client.getFreeBusy(check_start, check_end);
        const primaryBusy = freeBusy["primary"]?.busy || [];

        return {
          success: true,
          result: {
            period: { start: check_start, end: check_end },
            busy_slots: primaryBusy,
            is_free: primaryBusy.length === 0,
          },
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    console.error("[CalendarTool] Error:", {
      action,
      tenant_id: context.tenant_id,
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};
