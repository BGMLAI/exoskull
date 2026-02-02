// =====================================================
// UNIFIED GOOGLE CLIENT
// Combines: Google Fit + Google Workspace + YouTube + Photos + Contacts
// =====================================================

import { RigConnection, RigSyncResult } from '../types';
import { GoogleFitClient } from '../google-fit/client';
import {
  GoogleWorkspaceClient,
  GmailMessage,
  CalendarEvent,
  DriveFile,
  GoogleTask,
  GoogleTaskList,
} from '../google-workspace/client';

// YouTube API
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

// People API (Contacts)
const PEOPLE_API = 'https://people.googleapis.com/v1';

// Photos API
const PHOTOS_API = 'https://photoslibrary.googleapis.com/v1';

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  thumbnailUrl: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: string;
  likeCount: string;
}

export interface GoogleContact {
  resourceName: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  photoUrl?: string;
}

export interface GooglePhoto {
  id: string;
  filename: string;
  mimeType: string;
  creationTime: string;
  width: string;
  height: string;
  baseUrl: string;
}

export interface GoogleDashboardData {
  fit: {
    steps: { date: string; steps: number }[];
    heartRate: { date: string; bpm: number }[];
    calories: { date: string; calories: number }[];
    sleep: { date: string; durationMinutes: number }[];
    todaySteps: number;
    todayCalories: number;
    avgHeartRate: number;
  };
  workspace: {
    gmail: {
      unreadCount: number;
      recentEmails: GmailMessage[];
    };
    calendar: {
      todaysEvents: CalendarEvent[];
      nextMeeting: CalendarEvent | null;
    };
    drive: {
      recentFiles: DriveFile[];
    };
    tasks: {
      activeCount: number;
      overdueCount: number;
      activeTasks: GoogleTask[];
      overdueTasks: GoogleTask[];
    };
  };
  youtube: {
    channel: YouTubeChannel | null;
    recentVideos: YouTubeVideo[];
  };
  contacts: {
    totalCount: number;
    recentContacts: GoogleContact[];
  };
  photos: {
    recentPhotos: GooglePhoto[];
  };
}

export class GoogleClient {
  private accessToken: string;
  private fitClient: GoogleFitClient;
  private workspaceClient: GoogleWorkspaceClient;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.fitClient = new GoogleFitClient(accessToken);
    this.workspaceClient = new GoogleWorkspaceClient(accessToken);
  }

  private async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // =====================================================
  // GOOGLE FIT (delegated)
  // =====================================================

  get fit() {
    return this.fitClient;
  }

  // =====================================================
  // GOOGLE WORKSPACE (delegated)
  // =====================================================

  get workspace() {
    return this.workspaceClient;
  }

  // Convenience accessors
  get gmail() {
    return {
      getRecentEmails: (max?: number) => this.workspaceClient.getRecentEmails(max),
      getUnreadCount: () => this.workspaceClient.getUnreadCount(),
      sendEmail: (to: string, subject: string, body: string) =>
        this.workspaceClient.sendEmail(to, subject, body),
    };
  }

  get calendar() {
    return {
      getUpcomingEvents: (calendarId?: string, max?: number) =>
        this.workspaceClient.getUpcomingEvents(calendarId, max),
      getTodaysEvents: (calendarId?: string) =>
        this.workspaceClient.getTodaysEvents(calendarId),
      createEvent: (calendarId: string, event: Partial<CalendarEvent>) =>
        this.workspaceClient.createEvent(calendarId, event),
      getFreeBusy: (timeMin: string, timeMax: string, calendars?: string[]) =>
        this.workspaceClient.getFreeBusy(timeMin, timeMax, calendars),
    };
  }

  get drive() {
    return {
      getRecentFiles: (max?: number) => this.workspaceClient.getRecentFiles(max),
      searchFiles: (query: string, max?: number) =>
        this.workspaceClient.searchFiles(query, max),
    };
  }

  get tasks() {
    return {
      getTaskLists: () => this.workspaceClient.getTaskLists(),
      getTasks: (listId?: string, showCompleted?: boolean) =>
        this.workspaceClient.getTasks(listId, showCompleted),
      createTask: (listId: string, task: { title: string; notes?: string; due?: string }) =>
        this.workspaceClient.createTask(listId, task),
      completeTask: (listId: string, taskId: string) =>
        this.workspaceClient.completeTask(listId, taskId),
      getActiveTasks: (listId?: string) => this.workspaceClient.getActiveTasks(listId),
      getOverdueTasks: (listId?: string) => this.workspaceClient.getOverdueTasks(listId),
    };
  }

  // =====================================================
  // YOUTUBE
  // =====================================================

  async getMyChannel(): Promise<YouTubeChannel | null> {
    try {
      const response = await this.fetch<{
        items: {
          id: string;
          snippet: { title: string; description: string; thumbnails: { default: { url: string } } };
          statistics: { subscriberCount: string; videoCount: string; viewCount: string };
        }[];
      }>(`${YOUTUBE_API}/channels?part=snippet,statistics&mine=true`);

      if (!response.items?.length) return null;

      const channel = response.items[0];
      return {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        subscriberCount: channel.statistics.subscriberCount,
        videoCount: channel.statistics.videoCount,
        viewCount: channel.statistics.viewCount,
        thumbnailUrl: channel.snippet.thumbnails.default.url,
      };
    } catch {
      return null;
    }
  }

  async getMyVideos(maxResults: number = 10): Promise<YouTubeVideo[]> {
    try {
      // First get channel's uploads playlist
      const channelResponse = await this.fetch<{
        items: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
      }>(`${YOUTUBE_API}/channels?part=contentDetails&mine=true`);

      if (!channelResponse.items?.length) return [];

      const uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;

      // Get videos from uploads playlist
      const playlistResponse = await this.fetch<{
        items: { snippet: { resourceId: { videoId: string } } }[];
      }>(
        `${YOUTUBE_API}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}`
      );

      if (!playlistResponse.items?.length) return [];

      const videoIds = playlistResponse.items.map((item) => item.snippet.resourceId.videoId);

      // Get video details
      const videosResponse = await this.fetch<{
        items: {
          id: string;
          snippet: {
            title: string;
            description: string;
            publishedAt: string;
            thumbnails: { medium: { url: string } };
          };
          statistics: { viewCount: string; likeCount: string };
        }[];
      }>(
        `${YOUTUBE_API}/videos?part=snippet,statistics&id=${videoIds.join(',')}`
      );

      return videosResponse.items.map((video) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description.slice(0, 200),
        publishedAt: video.snippet.publishedAt,
        thumbnailUrl: video.snippet.thumbnails.medium?.url || '',
        viewCount: video.statistics.viewCount,
        likeCount: video.statistics.likeCount,
      }));
    } catch {
      return [];
    }
  }

  // =====================================================
  // CONTACTS
  // =====================================================

  async getContacts(maxResults: number = 100): Promise<GoogleContact[]> {
    try {
      const response = await this.fetch<{
        connections: {
          resourceName: string;
          names?: { displayName: string }[];
          emailAddresses?: { value: string }[];
          phoneNumbers?: { value: string }[];
          organizations?: { name: string }[];
          photos?: { url: string }[];
        }[];
        totalPeople: number;
      }>(
        `${PEOPLE_API}/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,photos&pageSize=${maxResults}`
      );

      return (response.connections || []).map((contact) => ({
        resourceName: contact.resourceName,
        name: contact.names?.[0]?.displayName || 'Unknown',
        email: contact.emailAddresses?.[0]?.value,
        phone: contact.phoneNumbers?.[0]?.value,
        organization: contact.organizations?.[0]?.name,
        photoUrl: contact.photos?.[0]?.url,
      }));
    } catch {
      return [];
    }
  }

  async getContactsCount(): Promise<number> {
    try {
      const response = await this.fetch<{ totalPeople: number }>(
        `${PEOPLE_API}/people/me/connections?personFields=names&pageSize=1`
      );
      return response.totalPeople || 0;
    } catch {
      return 0;
    }
  }

  // =====================================================
  // PHOTOS
  // =====================================================

  async getRecentPhotos(pageSize: number = 20): Promise<GooglePhoto[]> {
    try {
      const response = await this.fetch<{
        mediaItems: {
          id: string;
          filename: string;
          mimeType: string;
          mediaMetadata: { creationTime: string; width: string; height: string };
          baseUrl: string;
        }[];
      }>(`${PHOTOS_API}/mediaItems?pageSize=${pageSize}`);

      return (response.mediaItems || []).map((item) => ({
        id: item.id,
        filename: item.filename,
        mimeType: item.mimeType,
        creationTime: item.mediaMetadata.creationTime,
        width: item.mediaMetadata.width,
        height: item.mediaMetadata.height,
        baseUrl: item.baseUrl,
      }));
    } catch {
      return [];
    }
  }

  // =====================================================
  // UNIFIED DASHBOARD DATA
  // =====================================================

  async getDashboardData(): Promise<GoogleDashboardData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const [
      fitData,
      workspaceData,
      youtubeChannel,
      youtubeVideos,
      contacts,
      contactsCount,
      photos,
    ] = await Promise.all([
      this.fitClient.getAllData(startDate, endDate).catch(() => ({
        steps: [],
        heartRate: [],
        calories: [],
        sleep: [],
        distance: [],
      })),
      this.workspaceClient.getDashboardData().catch(() => ({
        gmail: { unreadCount: 0, recentEmails: [] },
        calendar: { todaysEvents: [], nextMeeting: null },
        drive: { recentFiles: [] },
        tasks: { activeCount: 0, overdueCount: 0, activeTasks: [], overdueTasks: [] },
      })),
      this.getMyChannel(),
      this.getMyVideos(5),
      this.getContacts(10),
      this.getContactsCount(),
      this.getRecentPhotos(10),
    ]);

    // Calculate today's stats
    const today = new Date().toISOString().split('T')[0];
    const todaySteps = fitData.steps.find((s) => s.date === today)?.steps || 0;
    const todayCalories = fitData.calories.find((c) => c.date === today)?.calories || 0;
    const avgHeartRate =
      fitData.heartRate.length > 0
        ? Math.round(
            fitData.heartRate.reduce((sum, h) => sum + h.bpm, 0) / fitData.heartRate.length
          )
        : 0;

    return {
      fit: {
        steps: fitData.steps,
        heartRate: fitData.heartRate,
        calories: fitData.calories,
        sleep: fitData.sleep,
        todaySteps,
        todayCalories,
        avgHeartRate,
      },
      workspace: workspaceData,
      youtube: {
        channel: youtubeChannel,
        recentVideos: youtubeVideos,
      },
      contacts: {
        totalCount: contactsCount,
        recentContacts: contacts,
      },
      photos: {
        recentPhotos: photos,
      },
    };
  }
}

// =====================================================
// SYNC FUNCTION
// =====================================================

export async function syncGoogleData(
  connection: RigConnection,
  days: number = 7
): Promise<RigSyncResult> {
  try {
    if (!connection.access_token) {
      return { success: false, records_synced: 0, error: 'No access token' };
    }

    const client = new GoogleClient(connection.access_token);
    const data = await client.getDashboardData();

    // Count records
    const fitRecords =
      data.fit.steps.length +
      data.fit.heartRate.length +
      data.fit.calories.length +
      data.fit.sleep.length;
    const workspaceRecords =
      data.workspace.gmail.recentEmails.length +
      data.workspace.calendar.todaysEvents.length +
      data.workspace.drive.recentFiles.length +
      data.workspace.tasks.activeTasks.length;
    const youtubeRecords = data.youtube.recentVideos.length + (data.youtube.channel ? 1 : 0);
    const contactsRecords = data.contacts.recentContacts.length;
    const photosRecords = data.photos.recentPhotos.length;

    const totalRecords =
      fitRecords + workspaceRecords + youtubeRecords + contactsRecords + photosRecords;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      success: true,
      records_synced: totalRecords,
      data_range: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
    };
  } catch (error) {
    console.error('[Google] Sync error:', error);
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Create client from connection
export function createGoogleClient(connection: RigConnection): GoogleClient | null {
  if (!connection.access_token) return null;
  return new GoogleClient(connection.access_token);
}
