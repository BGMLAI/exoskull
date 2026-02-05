// =====================================================
// FACEBOOK / META GRAPH API CLIENT
// Profile, Posts, Photos, Friends, Pages + Instagram
// =====================================================

import { RigConnection, RigSyncResult } from "../types";

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

export interface FacebookDashboardData {
  profile: FacebookProfile | null;
  posts: FacebookPost[];
  photos: FacebookPhoto[];
  friends: { totalCount: number; list: FacebookFriend[] };
  pages: FacebookPage[];
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
      console.error("[Facebook] API error:", {
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
    const [profile, posts, photos, friends, pages] = await Promise.all([
      this.getProfile().catch(() => null),
      this.getRecentPosts(10).catch(() => []),
      this.getPhotos(10).catch(() => []),
      this.getFriends(10).catch(() => ({ totalCount: 0, list: [] })),
      this.getPages().catch(() => []),
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
      (data.instagram.profile ? 1 : 0) +
      data.instagram.recentMedia.length;

    return {
      success: true,
      records_synced: totalRecords,
    };
  } catch (error) {
    console.error("[Facebook] Sync error:", error);
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
