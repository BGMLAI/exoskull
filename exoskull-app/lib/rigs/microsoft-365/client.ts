// =====================================================
// MICROSOFT 365 CLIENT (Outlook, Calendar, OneDrive)
// =====================================================

import { RigConnection } from "../types";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

export interface OutlookMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: string;
}

export interface OutlookEvent {
  id: string;
  subject: string;
  body?: { content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: {
    emailAddress: { name: string; address: string };
    status: { response: string };
  }[];
  location?: { displayName: string };
  onlineMeeting?: { joinUrl: string };
  isOnlineMeeting: boolean;
}

export interface OneDriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
}

export class Microsoft365Client {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${GRAPH_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft Graph error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // =====================================================
  // USER
  // =====================================================

  async getProfile(): Promise<{
    displayName: string;
    mail: string;
    id: string;
  }> {
    return this.fetch("/me");
  }

  // =====================================================
  // OUTLOOK MAIL
  // =====================================================

  async getRecentEmails(top: number = 20): Promise<OutlookMessage[]> {
    const response = await this.fetch<{ value: OutlookMessage[] }>(
      `/me/messages?$top=${top}&$orderby=receivedDateTime desc`,
    );
    return response.value || [];
  }

  async getUnreadCount(): Promise<number> {
    const response = await this.fetch<{ "@odata.count": number }>(
      "/me/mailFolders/Inbox/messages?$count=true&$filter=isRead eq false&$top=1",
    );
    return response["@odata.count"] || 0;
  }

  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    isHtml: boolean = true,
  ): Promise<void> {
    await this.fetch("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: isHtml ? "HTML" : "Text",
            content: body,
          },
          toRecipients: to.map((email) => ({
            emailAddress: { address: email },
          })),
        },
      }),
    });
  }

  // =====================================================
  // CALENDAR
  // =====================================================

  async getUpcomingEvents(top: number = 10): Promise<OutlookEvent[]> {
    const now = new Date().toISOString();
    const response = await this.fetch<{ value: OutlookEvent[] }>(
      `/me/events?$filter=start/dateTime ge '${now}'&$top=${top}&$orderby=start/dateTime`,
    );
    return response.value || [];
  }

  async getTodaysEvents(): Promise<OutlookEvent[]> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const response = await this.fetch<{ value: OutlookEvent[] }>(
      `/me/calendarView?startDateTime=${startOfDay}&endDateTime=${endOfDay}&$orderby=start/dateTime`,
    );
    return response.value || [];
  }

  async createEvent(event: Partial<OutlookEvent>): Promise<OutlookEvent> {
    return this.fetch("/me/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async getFreeBusy(
    start: string,
    end: string,
    schedules: string[],
  ): Promise<{ scheduleId: string; availabilityView: string }[]> {
    const response = await this.fetch<{
      value: { scheduleId: string; availabilityView: string }[];
    }>("/me/calendar/getSchedule", {
      method: "POST",
      body: JSON.stringify({
        schedules,
        startTime: { dateTime: start, timeZone: "UTC" },
        endTime: { dateTime: end, timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    });
    return response.value || [];
  }

  // =====================================================
  // ONEDRIVE
  // =====================================================

  async getRecentFiles(top: number = 20): Promise<OneDriveItem[]> {
    const response = await this.fetch<{ value: OneDriveItem[] }>(
      `/me/drive/recent?$top=${top}`,
    );
    return response.value || [];
  }

  async getRootFiles(top: number = 20): Promise<OneDriveItem[]> {
    const response = await this.fetch<{ value: OneDriveItem[] }>(
      `/me/drive/root/children?$top=${top}&$orderby=lastModifiedDateTime desc`,
    );
    return response.value || [];
  }

  async searchFiles(query: string, top: number = 10): Promise<OneDriveItem[]> {
    const response = await this.fetch<{ value: OneDriveItem[] }>(
      `/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=${top}`,
    );
    return response.value || [];
  }

  // =====================================================
  // TEAMS
  // =====================================================

  async getJoinedTeams(): Promise<{ id: string; displayName: string }[]> {
    const response = await this.fetch<{
      value: { id: string; displayName: string }[];
    }>("/me/joinedTeams");
    return response.value || [];
  }

  async getTeamChannels(
    teamId: string,
  ): Promise<{ id: string; displayName: string; description?: string }[]> {
    const response = await this.fetch<{
      value: { id: string; displayName: string; description?: string }[];
    }>(`/teams/${teamId}/channels`);
    return response.value || [];
  }

  async getRecentChats(top: number = 20): Promise<
    {
      id: string;
      topic?: string;
      chatType: string;
      lastUpdatedDateTime: string;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        topic?: string;
        chatType: string;
        lastUpdatedDateTime: string;
      }[];
    }>(`/me/chats?$top=${top}&$orderby=lastUpdatedDateTime desc`);
    return response.value || [];
  }

  async getChatMessages(
    chatId: string,
    top: number = 20,
  ): Promise<
    {
      id: string;
      body: { content: string; contentType: string };
      from?: { user?: { displayName: string } };
      createdDateTime: string;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        body: { content: string; contentType: string };
        from?: { user?: { displayName: string } };
        createdDateTime: string;
      }[];
    }>(`/me/chats/${chatId}/messages?$top=${top}`);
    return response.value || [];
  }

  async sendChatMessage(chatId: string, content: string): Promise<void> {
    await this.fetch(`/me/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: { content },
      }),
    });
  }

  // =====================================================
  // SHAREPOINT
  // =====================================================

  async getSites(searchQuery?: string): Promise<
    {
      id: string;
      displayName: string;
      webUrl: string;
      description?: string;
    }[]
  > {
    const endpoint = searchQuery
      ? `/sites?search=${encodeURIComponent(searchQuery)}`
      : "/sites?search=*";
    const response = await this.fetch<{
      value: {
        id: string;
        displayName: string;
        webUrl: string;
        description?: string;
      }[];
    }>(endpoint);
    return response.value || [];
  }

  async getSiteLists(siteId: string): Promise<
    {
      id: string;
      displayName: string;
      description?: string;
      webUrl: string;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        displayName: string;
        description?: string;
        webUrl: string;
      }[];
    }>(`/sites/${siteId}/lists`);
    return response.value || [];
  }

  async getListItems(
    siteId: string,
    listId: string,
    top: number = 50,
  ): Promise<Record<string, unknown>[]> {
    const response = await this.fetch<{
      value: { fields: Record<string, unknown> }[];
    }>(`/sites/${siteId}/lists/${listId}/items?expand=fields&$top=${top}`);
    return (response.value || []).map((item) => item.fields);
  }

  // =====================================================
  // ONENOTE
  // =====================================================

  async getNotebooks(): Promise<
    {
      id: string;
      displayName: string;
      lastModifiedDateTime: string;
      isDefault: boolean;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        displayName: string;
        lastModifiedDateTime: string;
        isDefault: boolean;
      }[];
    }>("/me/onenote/notebooks");
    return response.value || [];
  }

  async getNotebookSections(notebookId: string): Promise<
    {
      id: string;
      displayName: string;
      lastModifiedDateTime: string;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        displayName: string;
        lastModifiedDateTime: string;
      }[];
    }>(`/me/onenote/notebooks/${notebookId}/sections`);
    return response.value || [];
  }

  async getSectionPages(
    sectionId: string,
    top: number = 20,
  ): Promise<
    {
      id: string;
      title: string;
      createdDateTime: string;
      lastModifiedDateTime: string;
      contentUrl: string;
    }[]
  > {
    const response = await this.fetch<{
      value: {
        id: string;
        title: string;
        createdDateTime: string;
        lastModifiedDateTime: string;
        contentUrl: string;
      }[];
    }>(
      `/me/onenote/sections/${sectionId}/pages?$top=${top}&$orderby=lastModifiedDateTime desc`,
    );
    return response.value || [];
  }

  // =====================================================
  // COMBINED DATA
  // =====================================================

  async getDashboardData() {
    const [profile, unreadCount, todaysEvents, recentEmails, recentFiles] =
      await Promise.all([
        this.getProfile().catch(() => null),
        this.getUnreadCount().catch(() => 0),
        this.getTodaysEvents().catch(() => []),
        this.getRecentEmails(5).catch(() => []),
        this.getRecentFiles(5).catch(() => []),
      ]);

    return {
      profile,
      outlook: {
        unreadCount,
        recentEmails,
      },
      calendar: {
        todaysEvents,
        nextMeeting: todaysEvents[0] || null,
      },
      onedrive: {
        recentFiles,
      },
    };
  }
}

// Create client from connection
export function createMicrosoft365Client(
  connection: RigConnection,
): Microsoft365Client | null {
  if (!connection.access_token) return null;
  return new Microsoft365Client(connection.access_token);
}
