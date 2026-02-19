/**
 * Google Calendar IORS Tools
 *
 * 5 tools: list, create, update, delete, check_availability
 */

import type { ToolDefinition } from "./shared";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkAvailability,
} from "@/lib/integrations/google-calendar-adapter";

export const googleCalendarTools: ToolDefinition[] = [
  {
    definition: {
      name: "list_calendar_events",
      description:
        "Pokaż wydarzenia z Google Calendar użytkownika. Domyślnie nadchodzące.",
      input_schema: {
        type: "object" as const,
        properties: {
          time_range: {
            type: "string",
            enum: ["today", "tomorrow", "this_week", "next_week", "custom"],
            description: "Zakres czasowy (domyślnie: this_week)",
          },
          time_min: {
            type: "string",
            description: "Start zakresu ISO 8601 (dla custom)",
          },
          time_max: {
            type: "string",
            description: "Koniec zakresu ISO 8601 (dla custom)",
          },
          query: {
            type: "string",
            description: "Szukaj po treści/tytule wydarzenia",
          },
          max_results: {
            type: "number",
            description: "Ile wyników zwrócić (domyślnie 20)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const range = (input.time_range as string) || "this_week";
      const now = new Date();
      let timeMin = input.time_min as string | undefined;
      let timeMax = input.time_max as string | undefined;

      if (range === "today") {
        timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        timeMax = new Date(now.setHours(23, 59, 59, 999)).toISOString();
      } else if (range === "tomorrow") {
        const tmr = new Date(Date.now() + 86400000);
        timeMin = new Date(tmr.setHours(0, 0, 0, 0)).toISOString();
        timeMax = new Date(tmr.setHours(23, 59, 59, 999)).toISOString();
      } else if (range === "this_week") {
        timeMin = new Date().toISOString();
        timeMax = new Date(Date.now() + 7 * 86400000).toISOString();
      } else if (range === "next_week") {
        timeMin = new Date(Date.now() + 7 * 86400000).toISOString();
        timeMax = new Date(Date.now() + 14 * 86400000).toISOString();
      }

      const result = await listCalendarEvents(tenantId, {
        timeMin,
        timeMax,
        query: input.query as string | undefined,
        maxResults: (input.max_results as number) || 20,
      });

      if (!result.ok) return result.error || "Błąd pobierania kalendarza.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "create_calendar_event",
      description:
        "Utwórz nowe wydarzenie w Google Calendar. Opcjonalnie dodaj link Google Meet.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Tytuł wydarzenia" },
          start_time: {
            type: "string",
            description:
              "Czas rozpoczęcia ISO 8601 (np. 2026-02-20T10:00:00+01:00)",
          },
          end_time: {
            type: "string",
            description: "Czas zakończenia ISO 8601",
          },
          description: { type: "string", description: "Opis wydarzenia" },
          location: { type: "string", description: "Miejsce wydarzenia" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Lista emaili uczestników",
          },
          add_meet_link: {
            type: "boolean",
            description: "Dodaj link Google Meet (domyślnie false)",
          },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await createCalendarEvent(tenantId, {
        title: input.title as string,
        startTime: input.start_time as string,
        endTime: input.end_time as string,
        description: input.description as string | undefined,
        location: input.location as string | undefined,
        attendees: input.attendees as string[] | undefined,
        addMeetLink: (input.add_meet_link as boolean) || false,
      });

      if (!result.ok)
        return result.error || "Nie udało się utworzyć wydarzenia.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "update_calendar_event",
      description: "Zaktualizuj istniejące wydarzenie w Google Calendar.",
      input_schema: {
        type: "object" as const,
        properties: {
          event_id: {
            type: "string",
            description: "ID wydarzenia z list_calendar_events",
          },
          title: { type: "string", description: "Nowy tytuł" },
          start_time: {
            type: "string",
            description: "Nowy czas rozpoczęcia ISO 8601",
          },
          end_time: {
            type: "string",
            description: "Nowy czas zakończenia ISO 8601",
          },
          description: { type: "string", description: "Nowy opis" },
        },
        required: ["event_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await updateCalendarEvent(
        tenantId,
        input.event_id as string,
        {
          title: input.title as string | undefined,
          startTime: input.start_time as string | undefined,
          endTime: input.end_time as string | undefined,
          description: input.description as string | undefined,
        },
      );

      if (!result.ok)
        return result.error || "Nie udało się zaktualizować wydarzenia.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "delete_calendar_event",
      description: "Usuń wydarzenie z Google Calendar.",
      input_schema: {
        type: "object" as const,
        properties: {
          event_id: {
            type: "string",
            description: "ID wydarzenia do usunięcia",
          },
        },
        required: ["event_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await deleteCalendarEvent(
        tenantId,
        input.event_id as string,
      );
      if (!result.ok) return result.error || "Nie udało się usunąć wydarzenia.";
      return "Wydarzenie usunięte.";
    },
  },
  {
    definition: {
      name: "check_availability",
      description:
        "Sprawdź wolne sloty w kalendarzu użytkownika na dany dzień.",
      input_schema: {
        type: "object" as const,
        properties: {
          date: {
            type: "string",
            description: "Data (YYYY-MM-DD)",
          },
          duration_minutes: {
            type: "number",
            description: "Długość spotkania w minutach (domyślnie 60)",
          },
        },
        required: ["date"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await checkAvailability(
        tenantId,
        input.date as string,
        (input.duration_minutes as number) || 60,
      );
      if (!result.ok) return result.error || "Błąd sprawdzania dostępności.";
      return result.formatted!;
    },
  },
];
