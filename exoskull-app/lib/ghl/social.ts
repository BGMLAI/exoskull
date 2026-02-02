/**
 * GHL Social Planner Library
 *
 * Social media management via GHL API:
 * - Post creation and scheduling
 * - Multi-platform publishing (Facebook, Instagram, LinkedIn, TikTok, Twitter/X)
 * - Engagement tracking
 * - Content calendar
 */

import { GHLClient, ghlRateLimiter } from './client'

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter' | 'google'

export interface SocialPost {
  id: string
  locationId: string
  accountId: string
  type: SocialPlatform
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'processing'
  content?: string
  mediaUrls?: string[]
  scheduledAt?: string
  publishedAt?: string
  permalink?: string
  error?: string
  stats?: {
    likes?: number
    comments?: number
    shares?: number
    reach?: number
    engagement?: number
  }
  createdAt?: string
  updatedAt?: string
}

export interface CreatePostParams {
  accountIds: string[]  // Social account IDs to post to
  type?: SocialPlatform
  content: string
  mediaUrls?: string[]
  scheduledAt?: string  // ISO timestamp, omit for immediate posting
  firstComment?: string
  title?: string  // For LinkedIn articles, TikTok
  ogTags?: {
    title?: string
    description?: string
    image?: string
  }
}

export interface SocialAccount {
  id: string
  locationId: string
  type: SocialPlatform
  name: string
  avatar?: string
  username?: string
  connected: boolean
  pageId?: string
  accessToken?: string
  expiresAt?: string
}

export interface SocialCategory {
  id: string
  locationId: string
  name: string
  color?: string
}

/**
 * Get connected social accounts
 */
export async function getSocialAccounts(
  client: GHLClient
): Promise<{ accounts: SocialAccount[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ accounts: SocialAccount[] }>('/social-media-posting/accounts', { locationId })
}

/**
 * Create a social post
 */
export async function createPost(
  client: GHLClient,
  params: CreatePostParams
): Promise<{ post: SocialPost }> {
  await ghlRateLimiter.throttle()

  return client.post<{ post: SocialPost }>('/social-media-posting/', {
    ...params,
    locationId: client.getLocationId(),
  })
}

/**
 * Get posts
 */
export async function getPosts(
  client: GHLClient,
  params?: {
    accountId?: string
    status?: string
    startDate?: string
    endDate?: string
    limit?: number
    skip?: number
  }
): Promise<{ posts: SocialPost[]; total: number }> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()
  const queryParams: Record<string, string> = {
    locationId,
  }

  if (params?.accountId) queryParams.accountId = params.accountId
  if (params?.status) queryParams.status = params.status
  if (params?.startDate) queryParams.startDate = params.startDate
  if (params?.endDate) queryParams.endDate = params.endDate
  if (params?.limit) queryParams.limit = params.limit.toString()
  if (params?.skip) queryParams.skip = params.skip.toString()

  return client.get<{ posts: SocialPost[]; total: number }>('/social-media-posting/', queryParams)
}

/**
 * Get post by ID
 */
export async function getPost(
  client: GHLClient,
  postId: string
): Promise<{ post: SocialPost }> {
  await ghlRateLimiter.throttle()
  return client.get<{ post: SocialPost }>(`/social-media-posting/${postId}`)
}

/**
 * Update a post (only if draft or scheduled)
 */
export async function updatePost(
  client: GHLClient,
  postId: string,
  params: Partial<CreatePostParams>
): Promise<{ post: SocialPost }> {
  await ghlRateLimiter.throttle()
  return client.put<{ post: SocialPost }>(`/social-media-posting/${postId}`, params)
}

/**
 * Delete a post
 */
export async function deletePost(
  client: GHLClient,
  postId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ success: boolean }>(`/social-media-posting/${postId}`)
}

/**
 * Get categories for content organization
 */
export async function getCategories(
  client: GHLClient
): Promise<{ categories: SocialCategory[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ categories: SocialCategory[] }>('/social-media-posting/categories', { locationId })
}

/**
 * Schedule post for optimal engagement time
 */
export async function schedulePostOptimal(
  client: GHLClient,
  params: Omit<CreatePostParams, 'scheduledAt'> & {
    preferredDay?: 'today' | 'tomorrow' | 'next_week'
    preferredTime?: 'morning' | 'afternoon' | 'evening'
  }
): Promise<{ post: SocialPost; scheduledAt: string }> {
  // Calculate optimal time based on preferences
  const now = new Date()
  let targetDate = new Date(now)

  // Set day
  if (params.preferredDay === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1)
  } else if (params.preferredDay === 'next_week') {
    targetDate.setDate(targetDate.getDate() + 7)
  }

  // Set time (these are common optimal posting times)
  let hour: number
  switch (params.preferredTime) {
    case 'morning':
      hour = 9 // 9 AM
      break
    case 'afternoon':
      hour = 13 // 1 PM
      break
    case 'evening':
      hour = 19 // 7 PM
      break
    default:
      hour = 12 // Noon default
  }

  targetDate.setHours(hour, 0, 0, 0)

  // If scheduled time is in the past, move to next day
  if (targetDate < now) {
    targetDate.setDate(targetDate.getDate() + 1)
  }

  const scheduledAt = targetDate.toISOString()

  const { post } = await createPost(client, {
    ...params,
    scheduledAt,
  })

  return { post, scheduledAt }
}

/**
 * Upload media for social posts
 */
export async function uploadSocialMedia(
  client: GHLClient,
  file: Blob,
  fileName: string
): Promise<{ url: string }> {
  await ghlRateLimiter.throttle()

  const formData = new FormData()
  formData.append('file', file, fileName)
  formData.append('locationId', client.getLocationId())

  // Use media upload endpoint
  const response = await fetch('https://services.leadconnectorhq.com/medias/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Media upload failed: ${response.status}`)
  }

  const result = await response.json()
  return { url: result.fileUrl || result.url }
}

/**
 * Get post analytics
 */
export async function getPostAnalytics(
  client: GHLClient,
  postId: string
): Promise<{ analytics: SocialPost['stats'] }> {
  const { post } = await getPost(client, postId)
  return { analytics: post.stats || {} }
}

/**
 * Cross-post to multiple platforms
 */
export async function crossPost(
  client: GHLClient,
  content: string,
  platforms: SocialPlatform[],
  options?: {
    mediaUrls?: string[]
    scheduledAt?: string
  }
): Promise<{ posts: SocialPost[]; errors: Array<{ platform: SocialPlatform; error: string }> }> {
  // Get all connected accounts
  const { accounts } = await getSocialAccounts(client)

  // Filter accounts by requested platforms
  const targetAccounts = accounts.filter(
    account => platforms.includes(account.type) && account.connected
  )

  const posts: SocialPost[] = []
  const errors: Array<{ platform: SocialPlatform; error: string }> = []

  for (const account of targetAccounts) {
    try {
      const { post } = await createPost(client, {
        accountIds: [account.id],
        content,
        mediaUrls: options?.mediaUrls,
        scheduledAt: options?.scheduledAt,
      })
      posts.push(post)
    } catch (error) {
      errors.push({
        platform: account.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { posts, errors }
}
