/**
 * Google Calendar Direct Adapter
 *
 * Wraps GoogleWorkspaceClient calendar methods for IORS tool usage.
 * Handles token management and returns formatted results.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import {
  GoogleWorkspaceClient,
  CalendarEvent,
} from "@/lib/rigs/google-workspace/client";
import { logger } from "@/lib/logger";

const GOOGLE_SLUGS = ["google", "google-workspace", "google-calendar"];

async function getClient(
  tenantId: string,
): Promise<GoogleWorkspaceClient | null> {
  const supabase = getServiceSupabase();

  for (const slug of GOOGLE_SLUGS) {
    const { data: conn } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (conn?.access_token) {
      try {
        const token = await ensureFreshToken(conn);
        return new GoogleWorkspaceClient(token);
      } catch (err) {
        logger.error(`[GoogleCalendar] Token refresh failed for ${slug}:`, err);
        continue;
      }
    }
  }

  return null;
}

function formatEvent(e: CalendarEvent): string {
  const start = e.start.dateTime
    ? new Date(e.start.dateTime).toLocaleString("pl-PL")
    : e.start.date || "?";
  const end = e.end.dateTime
    ? new Date(e.end.dateTime).toLocaleString("pl-PL")
    : e.end.date || "";
  const parts = [`**${e.summary}** (${start} — ${end})`];
  if (e.location) parts.push(`Miejsce: ${e.location}`);
  if (e.description) parts.push(`Opis: ${e.description.slice(0, 200)}`);
  if (e.hangoutLink) parts.push(`Meet: ${e.hangoutLink}`);
  if (e.attendees?.length) {
    parts.push(`Uczestnicy: ${e.attendees.map((a) => a.email).join(", ")}`);
  }
  parts.push(`ID: ${e.id}`);
  return parts.join(" | ");
}

export async function listCalendarEvents(
  tenantId: string,
  options: {
    timeMin?: string;
    timeMax?: string;
    query?: string;
    maxResults?: number;
  },
): Promise<{
  ok: boolean;
  events?: CalendarEvent[];
  formatted?: string;
  error?: string;
}> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Calendar. Połącz konto Google.",
    };

  try {
    const events = await client.listEvents({
      timeMin: options.timeMin || new Date().toISOString(),
      timeMax: options.timeMax,
      q: options.query,
      maxResults: options.maxResults || 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    if (!events.length) {
      return {
        ok: true,
        events: [],
        formatted: "Brak wydarzeń w wybranym zakresie.",
      };
    }

    const formatted = events
      .map((e, i) => `${i + 1}. ${formatEvent(e)}`)
      .join("\n");
    return { ok: true, events, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleCalendar] listEvents error:", msg);
    return { ok: false, error: msg };
  }
}

export async function createCalendarEvent(
  tenantId: string,
  params: {
    title: string;
    startTime: string;
    endTime: string;
    description?: string;
    location?: string;
    attendees?: string[];
    addMeetLink?: boolean;
  },
): Promise<{
  ok: boolean;
  event?: CalendarEvent;
  formatted?: string;
  error?: string;
}> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Calendar. Połącz konto Google.",
    };

  try {
    const eventBody: Record<string, unknown> = {
      summary: params.title,
      start: { dateTime: params.startTime },
      end: { dateTime: params.endTime },
    };
    if (params.description) eventBody.description = params.description;
    if (params.location) eventBody.location = params.location;
    if (params.attendees?.length) {
      eventBody.attendees = params.attendees.map((email) => ({ email }));
    }

    const event = await client.createEvent(
      "primary",
      eventBody as Partial<CalendarEvent>,
      params.addMeetLink,
    );
    return { ok: true, event, formatted: `Utworzono: ${formatEvent(event)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleCalendar] createEvent error:", msg);
    return { ok: false, error: msg };
  }
}

export async function updateCalendarEvent(
  tenantId: string,
  eventId: string,
  updates: {
    title?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
  },
): Promise<{
  ok: boolean;
  event?: CalendarEvent;
  formatted?: string;
  error?: string;
}> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Calendar. Połącz konto Google.",
    };

  try {
    const body: Record<string, unknown> = {};
    if (updates.title) body.summary = updates.title;
    if (updates.startTime) body.start = { dateTime: updates.startTime };
    if (updates.endTime) body.end = { dateTime: updates.endTime };
    if (updates.description) body.description = updates.description;

    const event = await client.updateEvent(
      "primary",
      eventId,
      body as Partial<CalendarEvent>,
    );
    return {
      ok: true,
      event,
      formatted: `Zaktualizowano: ${formatEvent(event)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleCalendar] updateEvent error:", msg);
    return { ok: false, error: msg };
  }
}

export async function deleteCalendarEvent(
  tenantId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Calendar. Połącz konto Google.",
    };

  try {
    await client.deleteEvent("primary", eventId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleCalendar] deleteEvent error:", msg);
    return { ok: false, error: msg };
  }
}

export async function checkAvailability(
  tenantId: string,
  date: string,
  durationMinutes: number,
): Promise<{
  ok: boolean;
  slots?: string[];
  formatted?: string;
  error?: string;
}> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Calendar. Połącz konto Google.",
    };

  try {
    const dayStart = new Date(date);
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(20, 0, 0, 0);

    const freeBusy = await client.getFreeBusy(
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    const busySlots = freeBusy.primary?.busy || [];

    // Find free slots
    const freeSlots: string[] = [];
    let cursor = dayStart.getTime();
    const durationMs = durationMinutes * 60 * 1000;

    for (const busy of busySlots) {
      const busyStart = new Date(busy.start).getTime();
      if (busyStart - cursor >= durationMs) {
        freeSlots.push(
          `${new Date(cursor).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} — ${new Date(busyStart).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`,
        );
      }
      cursor = Math.max(cursor, new Date(busy.end).getTime());
    }
    if (dayEnd.getTime() - cursor >= durationMs) {
      freeSlots.push(
        `${new Date(cursor).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} — ${dayEnd.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`,
      );
    }

    if (!freeSlots.length) {
      return {
        ok: true,
        slots: [],
        formatted: `Brak wolnych ${durationMinutes}-minutowych slotów na ${date}.`,
      };
    }

    const formatted = `Wolne sloty (${durationMinutes} min) na ${date}:\n${freeSlots.map((s) => `  - ${s}`).join("\n")}`;
    return { ok: true, slots: freeSlots, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleCalendar] checkAvailability error:", msg);
    return { ok: false, error: msg };
  }
}
