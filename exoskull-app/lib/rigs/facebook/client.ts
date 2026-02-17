// =====================================================
// FACEBOOK / META GRAPH API CLIENT
// Profile, Posts, Photos, Friends, Pages + Instagram
// =====================================================

import { RigConnection, RigSyncResult } from "../types";

import { logger } from "@/lib/logger";
const GRAPH_API = "https://graph.facebook.com/v21.0";

// =====================================================
// TYPES
// =====================================================

export interface FacebookProfile {
  id: string;
  name: string;
  email?: string;
  picture?: { data: { url: string } };
  birthday?: string;
  location?: { name: string };
  gender?: string;
  link?: string;
}

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  type: string;
  full_picture?: string;
  permalink_url?: string;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  shares?: { count: number };
}

export interface FacebookPhoto {
  id: string;
  name?: string;
  source: string;
  created_time: string;
  width: number;
  height: number;
  album?: { id: string; name: string };
}

export interface FacebookFriend {
  id: string;
  name: string;
  picture?: { data: { url: string } };
}

export interface FacebookPage {
  id: string;
  name: string;
  category: string;
  fan_count: number;
  picture?: { data: { url: string } };
  access_token?: string;
  instagram_business_account?: { id: string };
}

export interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url?: string;
  website?: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink: string;
  like_count?: number;
  comments_count?: number;
}

export interface FacebookGroup {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  privacy: "OPEN" | "CLOSED" | "SECRET";
  icon?: string;
  updated_time: string;
}

export interface FacebookEvent {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: { name: string; location?: { city?: string; country?: string } };
  is_online: boolean;
  rsvp_status?: "attending" | "maybe" | "declined" | "not_replied";
  attending_count?: number;
  interested_count?: number;
  cover?: { source: string };
}

export interface FacebookVideo {
  id: string;
  title?: string;
  description?: string;
  source: string;
  picture: string;
  length: number; // seconds
  created_time: string;
  views?: number;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
}

export interface FacebookReel {
  id: string;
  description?: string;
  video?: { source: string };
  thumbnail_url?: string;
  created_time: string;
}

export interface FacebookDashboardData {
  profile: FacebookProfile | null;
  posts: FacebookPost[];
  photos: FacebookPhoto[];
  friends: { totalCount: number; list: FacebookFriend[] };
  pages: FacebookPage[];
  groups: FacebookGroup[];
  events: FacebookEvent[];
  videos: FacebookVideo[];
  instagram: {
    profile: InstagramProfile | null;
    recentMedia: InstagramMedia[];
  };
}

// =====================================================
// CLIENT
// =====================================================

export class FacebookClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${GRAPH_API}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error("[Facebook] API error:", {
        endpoint,
        status: response.status,
        error: error.error?.message || JSON.stringify(error),
      });
      throw new Error(
        `Facebook API error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  // =====================================================
  // PROFILE
  // =====================================================

  async getProfile(): Promise<FacebookProfile> {
    return this.fetch<FacebookProfile>("me", {
      fields: "id,name,email,picture.width(200),birthday,location,gender,link",
    });
  }

  // =====================================================
  // POSTS
  // =====================================================

  async getRecentPosts(limit: number = 25): Promise<FacebookPost[]> {
    const response = await this.fetch<{ data: FacebookPost[] }>("me/posts", {
      fields:
        "id,message,story,created_time,type,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares",
      limit: String(limit),
    });
    return response.data || [];
  }

  // =====================================================
  // PHOTOS
  // =====================================================

  async getPhotos(limit: number = 25): Promise<FacebookPhoto[]> {
    const response = await this.fetch<{ data: FacebookPhoto[] }>("me/photos", {
      type: "uploaded",
      fields: "id,name,source,created_time,width,height,album{id,name}",
      limit: String(limit),
    });
    return response.data || [];
  }

  // =====================================================
  // FRIENDS (limited to friends who also use the app)
  // =====================================================

  async getFriends(
    limit: number = 100,
  ): Promise<{ totalCount: number; list: FacebookFriend[] }> {
    const response = await this.fetch<{
      data: FacebookFriend[];
      summary: { total_count: number };
    }>("me/friends", {
      fields: "id,name,picture.width(100)",
      limit: String(limit),
    });
    return {
      totalCount: response.summary?.total_count || 0,
      list: response.data || [],
    };
  }

  // =====================================================
  // PAGES (managed by user)
  // =====================================================

  async getPages(): Promise<FacebookPage[]> {
    const response = await this.fetch<{ data: FacebookPage[] }>("me/accounts", {
      fields:
        "id,name,category,fan_count,picture.width(100),access_token,instagram_business_account",
    });
    return response.data || [];
  }

  // =====================================================
  // GROUPS (user's groups)
  // =====================================================

  async getGroups(limit: number = 25): Promise<FacebookGroup[]> {
    try {
      const response = await this.fetch<{ data: FacebookGroup[] }>(
        "me/groups",
        {
          fields: "id,name,description,member_count,privacy,icon,updated_time",
          limit: String(limit),
        },
      );
      return response.data || [];
    } catch {
      return [];
    }
  }

  // =====================================================
  // EVENTS (user's events)
  // =====================================================

  async getEvents(limit: number = 25): Promise<FacebookEvent[]> {
    try {
      const response = await this.fetch<{ data: FacebookEvent[] }>(
        "me/events",
        {
          fields:
            "id,name,description,start_time,end_time,place,is_online,rsvp_status,attending_count,interested_count,cover",
          limit: String(limit),
        },
      );
      return response.data || [];
    } catch {
      return [];
    }
  }

  // =====================================================
  // VIDEOS
  // =====================================================

  async getVideos(limit: number = 10): Promise<FacebookVideo[]> {
    try {
      const response = await this.fetch<{ data: FacebookVideo[] }>(
        "me/videos/uploaded",
        {
          fields:
            "id,title,description,source,picture,length,created_time,views,likes.summary(true),comments.summary(true)",
          limit: String(limit),
        },
      );
      return response.data || [];
    } catch {
      return [];
    }
  }

  // =====================================================
  // PAGE PUBLISHING (Stories, Reels - requires Page access token)
  // =====================================================

  /**
   * Publish a post to a Page (requires page access_token)
   */
  async publishPagePost(
    pageId: string,
    pageAccessToken: string,
    message: string,
    link?: string,
  ): Promise<{ id: string }> {
    const url = new URL(`${GRAPH_API}/${pageId}/feed`);
    url.searchParams.set("access_token", pageAccessToken);

    const body: Record<string, string> = { message };
    if (link) body.link = link;

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Facebook publish error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  /**
   * Publish a Reel to a Page (2-step: create container, then publish)
   * Requires page access_token and video URL
   */
  async publishPageReel(
    pageId: string,
    pageAccessToken: string,
    videoUrl: string,
    description?: string,
  ): Promise<{ id: string }> {
    const url = new URL(`${GRAPH_API}/${pageId}/video_reels`);
    url.searchParams.set("access_token", pageAccessToken);

    const body: Record<string, string> = {
      upload_phase: "start",
      video_url: videoUrl,
    };
    if (description) body.description = description;

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Facebook Reel publish error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  /**
   * Get Page insights (reach, engagement, impressions)
   */
  async getPageInsights(
    pageId: string,
    pageAccessToken: string,
    period: "day" | "week" | "days_28" = "day",
  ): Promise<
    Array<{
      name: string;
      period: string;
      values: Array<{
        value: number | Record<string, number>;
        end_time: string;
      }>;
    }>
  > {
    const url = new URL(`${GRAPH_API}/${pageId}/insights`);
    url.searchParams.set("access_token", pageAccessToken);
    url.searchParams.set(
      "metric",
      "page_impressions,page_engaged_users,page_post_engagements,page_fan_adds,page_views_total",
    );
    url.searchParams.set("period", period);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Page insights error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    const data = await response.json();
    return data.data || [];
  }

  // =====================================================
  // INSTAGRAM (via Page's Instagram Business Account)
  // =====================================================

  async getInstagramProfile(
    igAccountId: string,
  ): Promise<InstagramProfile | null> {
    try {
      return await this.fetch<InstagramProfile>(igAccountId, {
        fields:
          "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website",
      });
    } catch {
      return null;
    }
  }

  async getInstagramMedia(
    igAccountId: string,
    limit: number = 25,
  ): Promise<InstagramMedia[]> {
    try {
      const response = await this.fetch<{ data: InstagramMedia[] }>(
        `${igAccountId}/media`,
        {
          fields:
            "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count",
          limit: String(limit),
        },
      );
      return response.data || [];
    } catch {
      return [];
    }
  }

  // =====================================================
  // UNIFIED DASHBOARD DATA
  // =====================================================

  async getDashboardData(): Promise<FacebookDashboardData> {
    const [profile, posts, photos, friends, pages, groups, events, videos] =
      await Promise.all([
        this.getProfile().catch(() => null),
        this.getRecentPosts(10).catch(() => []),
        this.getPhotos(10).catch(() => []),
        this.getFriends(10).catch(() => ({ totalCount: 0, list: [] })),
        this.getPages().catch(() => []),
        this.getGroups(10).catch(() => []),
        this.getEvents(10).catch(() => []),
        this.getVideos(5).catch(() => []),
      ]);

    // Try to get Instagram data from first page with IG business account
    let instagramProfile: InstagramProfile | null = null;
    let instagramMedia: InstagramMedia[] = [];

    const pageWithIg = pages.find((p) => p.instagram_business_account?.id);
    if (pageWithIg?.instagram_business_account?.id) {
      const igId = pageWithIg.instagram_business_account.id;
      [instagramProfile, instagramMedia] = await Promise.all([
        this.getInstagramProfile(igId),
        this.getInstagramMedia(igId, 10),
      ]);
    }

    return {
      profile,
      posts,
      photos,
      friends,
      pages,
      groups,
      events,
      videos,
      instagram: {
        profile: instagramProfile,
        recentMedia: instagramMedia,
      },
    };
  }
}

// =====================================================
// SYNC FUNCTION
// =====================================================

export async function syncFacebookData(
  connection: RigConnection,
): Promise<RigSyncResult> {
  try {
    if (!connection.access_token) {
      return { success: false, records_synced: 0, error: "No access token" };
    }

    const client = new FacebookClient(connection.access_token);
    const data = await client.getDashboardData();

    const totalRecords =
      (data.profile ? 1 : 0) +
      data.posts.length +
      data.photos.length +
      data.friends.list.length +
      data.pages.length +
      data.groups.length +
      data.events.length +
      data.videos.length +
      (data.instagram.profile ? 1 : 0) +
      data.instagram.recentMedia.length;

    return {
      success: true,
      records_synced: totalRecords,
    };
  } catch (error) {
    logger.error("[Facebook] Sync error:", error);
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Create client from connection
export function createFacebookClient(
  connection: RigConnection,
): FacebookClient | null {
  if (!connection.access_token) return null;
  return new FacebookClient(connection.access_token);
}
