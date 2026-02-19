// =====================================================
// GOOGLE WORKSPACE CLIENT (Gmail, Calendar, Drive, Tasks)
// =====================================================

import { RigConnection } from "../types";

// Gmail API
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
// Calendar API
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
// Drive API
const DRIVE_API = "https://www.googleapis.com/drive/v3";
// Tasks API
const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
}

export interface GmailDraftMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers: { name: string; value: string }[] };
}

export interface GmailDraft {
  id: string;
  message: GmailDraftMessage;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus: string }[];
  location?: string;
  hangoutLink?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated: string;
  selfLink: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string; // RFC 3339 date
  completed?: string; // RFC 3339 timestamp
  deleted?: boolean;
  hidden?: boolean;
  parent?: string;
  position?: string;
  selfLink: string;
  updated: string;
  links?: { type: string; description: string; link: string }[];
}

export interface GoogleTaskWithList extends GoogleTask {
  taskListId: string;
  taskListTitle?: string;
}

export class GoogleWorkspaceClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private buildRawEmail(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): string {
    const lines: string[] = [
      `To: ${params.to}`,
      params.cc ? `Cc: ${params.cc}` : "",
      params.bcc ? `Bcc: ${params.bcc}` : "",
      params.replyTo ? `Reply-To: ${params.replyTo}` : "",
      `Subject: ${params.subject}`,
      "Content-Type: text/html; charset=utf-8",
    ];

    if (params.headers) {
      for (const [key, value] of Object.entries(params.headers)) {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push("", params.body);

    return Buffer.from(lines.filter(Boolean).join("\r\n")).toString(
      "base64url",
    );
  }

  // =====================================================
  // GMAIL
  // =====================================================

  async getRecentEmails(maxResults: number = 20): Promise<GmailMessage[]> {
    const response = await this.fetch<{ messages: { id: string }[] }>(
      `${GMAIL_API}/messages?maxResults=${maxResults}&labelIds=INBOX`,
    );

    const messages = await Promise.all(
      response.messages.slice(0, maxResults).map(async (msg) => {
        const full = await this.fetch<{
          id: string;
          threadId: string;
          snippet: string;
          labelIds: string[];
          payload: { headers: { name: string; value: string }[] };
        }>(
          `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        );

        const headers = full.payload.headers;
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
            ?.value || "";

        return {
          id: full.id,
          threadId: full.threadId,
          snippet: full.snippet,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          labelIds: full.labelIds,
        };
      }),
    );

    return messages;
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ id: string }> {
    const encodedEmail = this.buildRawEmail({ to, subject, body });

    return this.fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: encodedEmail }),
    });
  }

  // =====================================================
  // GMAIL DRAFTS
  // =====================================================

  async listDrafts(maxResults: number = 20): Promise<GmailDraft[]> {
    const response = await this.fetch<{ drafts: GmailDraft[] }>(
      `${GMAIL_API}/drafts?maxResults=${maxResults}`,
    );
    return response.drafts || [];
  }

  async getDraft(draftId: string): Promise<GmailDraft> {
    return this.fetch(`${GMAIL_API}/drafts/${draftId}`);
  }

  async createDraft(
    to: string,
    subject: string,
    body: string,
  ): Promise<GmailDraft> {
    const encodedEmail = this.buildRawEmail({ to, subject, body });

    return this.fetch(`${GMAIL_API}/drafts`, {
      method: "POST",
      body: JSON.stringify({
        message: { raw: encodedEmail },
      }),
    });
  }

  async sendDraft(draftId: string): Promise<{ id: string; threadId?: string }> {
    return this.fetch(`${GMAIL_API}/drafts/send`, {
      method: "POST",
      body: JSON.stringify({ id: draftId }),
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.fetch(`${GMAIL_API}/drafts/${draftId}`, {
      method: "DELETE",
    });
  }

  async getUnreadCount(): Promise<number> {
    const response = await this.fetch<{ resultSizeEstimate: number }>(
      `${GMAIL_API}/messages?labelIds=INBOX&labelIds=UNREAD&maxResults=1`,
    );
    return response.resultSizeEstimate;
  }

  // =====================================================
  // CALENDAR
  // =====================================================

  async listEvents(params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    q?: string;
    singleEvents?: boolean;
    orderBy?: string;
  }): Promise<CalendarEvent[]> {
    const calendarId = params.calendarId || "primary";
    const query = new URLSearchParams();
    if (params.timeMin) query.append("timeMin", params.timeMin);
    if (params.timeMax) query.append("timeMax", params.timeMax);
    if (params.maxResults)
      query.append("maxResults", params.maxResults.toString());
    if (params.q) query.append("q", params.q);
    if (params.singleEvents !== undefined) {
      query.append("singleEvents", params.singleEvents.toString());
    } else {
      query.append("singleEvents", "true");
    }
    if (params.orderBy) {
      query.append("orderBy", params.orderBy);
    } else if (params.timeMin) {
      query.append("orderBy", "startTime");
    }

    const response = await this.fetch<{ items: CalendarEvent[] }>(
      `${CALENDAR_API}/calendars/${calendarId}/events?${query.toString()}`,
    );
    return response.items || [];
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.fetch(
      `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
    );
  }

  async getUpcomingEvents(
    calendarId: string = "primary",
    maxResults: number = 10,
  ): Promise<CalendarEvent[]> {
    const now = new Date().toISOString();
    const response = await this.fetch<{ items: CalendarEvent[] }>(
      `${CALENDAR_API}/calendars/${calendarId}/events?timeMin=${now}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`,
    );
    return response.items || [];
  }

  async getTodaysEvents(
    calendarId: string = "primary",
  ): Promise<CalendarEvent[]> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const response = await this.fetch<{ items: CalendarEvent[] }>(
      `${CALENDAR_API}/calendars/${calendarId}/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`,
    );
    return response.items || [];
  }

  async createEvent(
    calendarId: string = "primary",
    event: Partial<CalendarEvent> & { conferenceData?: unknown },
    addMeetLink?: boolean,
  ): Promise<CalendarEvent> {
    const body = { ...event };
    if (addMeetLink) {
      (body as Record<string, unknown>).conferenceData = {
        createRequest: {
          requestId: `exoskull-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }
    const conferenceParam = addMeetLink ? "?conferenceDataVersion=1" : "";
    return this.fetch(
      `${CALENDAR_API}/calendars/${calendarId}/events${conferenceParam}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    updates: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    return this.fetch(
      `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      },
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.fetch(
      `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
      {
        method: "DELETE",
      },
    );
  }

  async getFreeBusy(
    timeMin: string,
    timeMax: string,
    calendars: string[] = ["primary"],
  ): Promise<Record<string, { busy: { start: string; end: string }[] }>> {
    const response = await this.fetch<{
      calendars: Record<string, { busy: { start: string; end: string }[] }>;
    }>(`${CALENDAR_API}/freeBusy`, {
      method: "POST",
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: calendars.map((id) => ({ id })),
      }),
    });
    return response.calendars;
  }

  // =====================================================
  // DRIVE
  // =====================================================

  async getRecentFiles(maxResults: number = 20): Promise<DriveFile[]> {
    const response = await this.fetch<{ files: DriveFile[] }>(
      `${DRIVE_API}/files?pageSize=${maxResults}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`,
    );
    return response.files || [];
  }

  async searchFiles(
    query: string,
    maxResults: number = 10,
  ): Promise<DriveFile[]> {
    const response = await this.fetch<{ files: DriveFile[] }>(
      `${DRIVE_API}/files?q=name contains '${query}'&pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`,
    );
    return response.files || [];
  }

  // =====================================================
  // TASKS
  // =====================================================

  async getTaskLists(): Promise<GoogleTaskList[]> {
    const response = await this.fetch<{ items: GoogleTaskList[] }>(
      `${TASKS_API}/users/@me/lists`,
    );
    return response.items || [];
  }

  async getDefaultTaskList(): Promise<GoogleTaskList | null> {
    const lists = await this.getTaskLists();
    return lists[0] || null;
  }

  async getTasks(
    taskListId: string = "@default",
    showCompleted: boolean = false,
  ): Promise<GoogleTask[]> {
    const params = new URLSearchParams({
      maxResults: "100",
      showCompleted: showCompleted.toString(),
      showHidden: "false",
    });
    const response = await this.fetch<{ items: GoogleTask[] }>(
      `${TASKS_API}/lists/${taskListId}/tasks?${params.toString()}`,
    );
    return response.items || [];
  }

  async getTask(taskListId: string, taskId: string): Promise<GoogleTask> {
    return this.fetch(`${TASKS_API}/lists/${taskListId}/tasks/${taskId}`);
  }

  async createTask(
    taskListId: string = "@default",
    task: { title: string; notes?: string; due?: string },
  ): Promise<GoogleTask> {
    return this.fetch(`${TASKS_API}/lists/${taskListId}/tasks`, {
      method: "POST",
      body: JSON.stringify(task),
    });
  }

  async updateTask(
    taskListId: string,
    taskId: string,
    updates: Partial<Pick<GoogleTask, "title" | "notes" | "due" | "status">>,
  ): Promise<GoogleTask> {
    return this.fetch(`${TASKS_API}/lists/${taskListId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async completeTask(taskListId: string, taskId: string): Promise<GoogleTask> {
    return this.updateTask(taskListId, taskId, { status: "completed" });
  }

  async uncompleteTask(
    taskListId: string,
    taskId: string,
  ): Promise<GoogleTask> {
    return this.updateTask(taskListId, taskId, { status: "needsAction" });
  }

  async deleteTask(taskListId: string, taskId: string): Promise<void> {
    await this.fetch(`${TASKS_API}/lists/${taskListId}/tasks/${taskId}`, {
      method: "DELETE",
    });
  }

  async getActiveTasks(taskListId: string = "@default"): Promise<GoogleTask[]> {
    const tasks = await this.getTasks(taskListId, false);
    return tasks.filter((t) => t.status === "needsAction");
  }

  async getDueTodayTasks(
    taskListId: string = "@default",
  ): Promise<GoogleTask[]> {
    const tasks = await this.getActiveTasks(taskListId);
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => t.due?.startsWith(today));
  }

  async getOverdueTasks(
    taskListId: string = "@default",
  ): Promise<GoogleTask[]> {
    const tasks = await this.getActiveTasks(taskListId);
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => t.due && t.due < today);
  }

  async getAllTasks(options?: { showCompleted?: boolean }): Promise<{
    taskLists: GoogleTaskList[];
    tasks: GoogleTaskWithList[];
  }> {
    const taskLists = await this.getTaskLists();
    const tasksByList = await Promise.all(
      taskLists.map((list) =>
        this.getTasks(list.id, options?.showCompleted || false),
      ),
    );

    const tasks: GoogleTaskWithList[] = taskLists.flatMap((list, index) =>
      tasksByList[index].map((task) => ({
        ...task,
        taskListId: list.id,
        taskListTitle: list.title,
      })),
    );

    return { taskLists, tasks };
  }

  // =====================================================
  // GOOGLE SHEETS
  // =====================================================

  async listSpreadsheets(maxResults: number = 10): Promise<
    {
      id: string;
      name: string;
      modifiedTime: string;
      webViewLink: string;
    }[]
  > {
    const response = await this.fetch<{
      files: {
        id: string;
        name: string;
        modifiedTime: string;
        webViewLink: string;
      }[];
    }>(
      `${DRIVE_API}/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,modifiedTime,webViewLink)&pageSize=${maxResults}&orderBy=modifiedTime desc`,
    );
    return response.files || [];
  }

  async readSheet(
    spreadsheetId: string,
    range: string = "Sheet1",
  ): Promise<string[][]> {
    const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
    const response = await this.fetch<{
      values: string[][];
    }>(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`);
    return response.values || [];
  }

  async writeSheet(
    spreadsheetId: string,
    range: string,
    values: string[][],
  ): Promise<{ updatedCells: number }> {
    const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
    const response = await this.fetch<{
      updatedCells: number;
    }>(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        body: JSON.stringify({ values }),
      },
    );
    return { updatedCells: response.updatedCells || 0 };
  }

  async appendToSheet(
    spreadsheetId: string,
    range: string,
    values: string[][],
  ): Promise<{ updatedCells: number }> {
    const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
    const response = await this.fetch<{
      updates: { updatedCells: number };
    }>(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        body: JSON.stringify({ values }),
      },
    );
    return { updatedCells: response.updates?.updatedCells || 0 };
  }

  // =====================================================
  // COMBINED DATA
  // =====================================================

  async getDashboardData() {
    const [
      unreadCount,
      todaysEvents,
      recentEmails,
      recentFiles,
      activeTasks,
      overdueTasks,
    ] = await Promise.all([
      this.getUnreadCount().catch(() => 0),
      this.getTodaysEvents().catch(() => []),
      this.getRecentEmails(5).catch(() => []),
      this.getRecentFiles(5).catch(() => []),
      this.getActiveTasks().catch(() => []),
      this.getOverdueTasks().catch(() => []),
    ]);

    return {
      gmail: {
        unreadCount,
        recentEmails,
      },
      calendar: {
        todaysEvents,
        nextMeeting: todaysEvents[0] || null,
      },
      drive: {
        recentFiles,
      },
      tasks: {
        activeCount: activeTasks.length,
        overdueCount: overdueTasks.length,
        activeTasks: activeTasks.slice(0, 10),
        overdueTasks: overdueTasks.slice(0, 5),
      },
    };
  }
}

// Create client from connection
export function createGoogleWorkspaceClient(
  connection: RigConnection,
): GoogleWorkspaceClient | null {
  if (!connection.access_token) return null;
  return new GoogleWorkspaceClient(connection.access_token);
}
