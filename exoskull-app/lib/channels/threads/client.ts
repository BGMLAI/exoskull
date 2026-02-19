/**
 * Threads API Client (graph.threads.net)
 *
 * Supports: publishing posts, listing posts, replying to posts.
 * Uses Threads API v1.0.
 */

import { logger } from "@/lib/logger";

const THREADS_API = "https://graph.threads.net/v1.0";

export class ThreadsClient {
  private accessToken: string;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
  }

  private async fetch<T>(
    endpoint: string,
    params: Record<string, string> = {},
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${THREADS_API}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const options: RequestInit = { method };
    if (body && method === "POST") {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error("[Threads] API error:", {
        endpoint,
        status: response.status,
        error:
          (error as Record<string, Record<string, string>>).error?.message ||
          JSON.stringify(error),
      });
      throw new Error(
        `Threads API error: ${response.status} - ${(error as Record<string, Record<string, string>>).error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  /**
   * Publish a text post (2-step: create container → publish)
   */
  async publishPost(text: string, imageUrl?: string): Promise<{ id: string }> {
    // Step 1: Create media container
    const containerBody: Record<string, unknown> = {
      media_type: imageUrl ? "IMAGE" : "TEXT",
      text,
    };
    if (imageUrl) containerBody.image_url = imageUrl;

    const container = await this.fetch<{ id: string }>(
      `${this.userId}/threads`,
      {},
      "POST",
      containerBody,
    );

    // Step 2: Publish
    const result = await this.fetch<{ id: string }>(
      `${this.userId}/threads_publish`,
      {},
      "POST",
      { creation_id: container.id },
    );

    return result;
  }

  /**
   * List recent threads posts
   */
  async listPosts(limit: number = 20): Promise<
    Array<{
      id: string;
      text?: string;
      timestamp: string;
      media_type: string;
      permalink: string;
    }>
  > {
    const response = await this.fetch<{
      data: Array<{
        id: string;
        text?: string;
        timestamp: string;
        media_type: string;
        permalink: string;
      }>;
    }>(`${this.userId}/threads`, {
      fields: "id,text,timestamp,media_type,permalink",
      limit: String(limit),
    });

    return response.data || [];
  }

  /**
   * Reply to a specific thread post
   */
  async replyToPost(postId: string, text: string): Promise<{ id: string }> {
    // Step 1: Create reply container
    const container = await this.fetch<{ id: string }>(
      `${this.userId}/threads`,
      {},
      "POST",
      {
        media_type: "TEXT",
        text,
        reply_to_id: postId,
      },
    );

    // Step 2: Publish reply
    const result = await this.fetch<{ id: string }>(
      `${this.userId}/threads_publish`,
      {},
      "POST",
      { creation_id: container.id },
    );

    return result;
  }
}

export function createThreadsClient(
  accessToken: string,
  userId: string,
): ThreadsClient {
  return new ThreadsClient(accessToken, userId);
}
