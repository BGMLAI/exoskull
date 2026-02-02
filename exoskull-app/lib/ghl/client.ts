/**
 * GoHighLevel API Client
 *
 * Uses Private Integration Token for authentication.
 * Simple Bearer token auth - no OAuth complexity.
 *
 * Setup:
 * 1. GHL → Agency Settings → Private Integrations → Create
 * 2. Copy token to env: GHL_PRIVATE_TOKEN
 * 3. Set location ID: GHL_LOCATION_ID
 */

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'

// Private Integration Token (from GHL Settings → Private Integrations)
const GHL_PRIVATE_TOKEN = process.env.GHL_PRIVATE_TOKEN
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID

/**
 * GHL API Client class
 *
 * Simple client using Private Integration Token.
 * No OAuth, no token refresh - just Bearer auth.
 */
export class GHLClient {
  private token: string
  private locationId: string

  constructor(token?: string, locationId?: string) {
    this.token = token || GHL_PRIVATE_TOKEN || ''
    this.locationId = locationId || GHL_LOCATION_ID || ''

    if (!this.token) {
      console.warn('GHL: No token provided. Set GHL_PRIVATE_TOKEN env var.')
    }
  }

  /**
   * Make authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.token) {
      throw new GHLAPIError('GHL_PRIVATE_TOKEN not configured', 401, '')
    }

    await ghlRateLimiter.throttle()

    const url = `${GHL_BASE_URL}${endpoint}`
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new GHLAPIError(
        `GHL API error: ${response.status} ${response.statusText}`,
        response.status,
        error
      )
    }

    return response.json()
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = endpoint
    if (params) {
      const searchParams = new URLSearchParams(params)
      url = `${endpoint}?${searchParams.toString()}`
    }
    return this.request<T>(url, { method: 'GET' })
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  /**
   * Get location ID
   */
  getLocationId(): string {
    return this.locationId
  }

  /**
   * Check if client is configured
   */
  isConfigured(): boolean {
    return !!this.token && !!this.locationId
  }
}

/**
 * Custom error class for GHL API errors
 */
export class GHLAPIError extends Error {
  status: number
  body: string

  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'GHLAPIError'
    this.status = status
    this.body = body
  }
}

/**
 * Rate limiter for GHL API
 * Limits: 100 requests per 10 seconds, 200,000 per day
 */
export class GHLRateLimiter {
  private requests: number[] = []
  private readonly windowMs = 10000 // 10 seconds
  private readonly maxRequests = 100

  async throttle(): Promise<void> {
    const now = Date.now()

    // Remove requests outside window
    this.requests = this.requests.filter(time => now - time < this.windowMs)

    if (this.requests.length >= this.maxRequests) {
      // Wait until oldest request exits window
      const waitTime = this.windowMs - (now - this.requests[0])
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return this.throttle()
    }

    this.requests.push(now)
  }
}

// Singleton rate limiter
export const ghlRateLimiter = new GHLRateLimiter()

// Default client instance (uses env vars)
export const ghlClient = new GHLClient()

// ============================================
// Legacy exports (for backward compatibility)
// ============================================

// These are no longer needed with Private Integration Token
// but kept for any code that might reference them
export interface GHLTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
  locationId: string
  userId?: string
  companyId?: string
}

export interface GHLConnection {
  id: string
  tenant_id: string
  location_id: string
  access_token: string
  refresh_token: string
  token_expires_at: Date
  scopes: string[]
  connected_at: Date
}

// Scopes reference (not used with Private Integration, but useful for docs)
export const GHL_SCOPES = [
  'contacts.readonly', 'contacts.write',
  'conversations.readonly', 'conversations.write',
  'calendars.readonly', 'calendars.write',
  'opportunities.readonly', 'opportunities.write',
  'workflows.readonly',
  'socialplanner/post.readonly', 'socialplanner/post.write',
  'locations.readonly', 'locations.write',
]

// Legacy OAuth functions - no longer needed
export function getAuthorizationUrl(_state: string): string {
  throw new Error('OAuth not used. Use Private Integration Token instead.')
}

export async function exchangeCodeForTokens(_code: string): Promise<GHLTokens> {
  throw new Error('OAuth not used. Use Private Integration Token instead.')
}

export async function refreshAccessToken(_refreshToken: string): Promise<GHLTokens> {
  throw new Error('OAuth not used. Use Private Integration Token instead.')
}
