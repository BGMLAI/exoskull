/**
 * SSRF Protection Guard
 *
 * Based on OpenClaw 2026.2.x security features
 * Blocks requests to private/localhost URLs to prevent SSRF attacks
 */

import { URL } from 'url'

// Private IP ranges (RFC 1918 + localhost + link-local)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                    // Loopback
  /^10\./,                     // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
  /^192\.168\./,               // Class C private
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^::1$/,                     // IPv6 loopback
  /^fe80:/i,                   // IPv6 link-local
  /^fc00:/i,                   // IPv6 unique local
  /^fd00:/i,                   // IPv6 unique local
]

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'local',
  '0.0.0.0',
  '::',
  '::1',
  'metadata.google.internal',        // GCP metadata
  '169.254.169.254',                 // AWS/GCP/Azure metadata
  'metadata.google',
  'kubernetes.default.svc',
  'kubernetes.default',
]

export interface SSRFCheckResult {
  allowed: boolean
  reason?: string
  resolvedIp?: string
}

/**
 * Check if a URL is safe from SSRF attacks
 */
export function checkSSRF(urlString: string, options?: {
  allowPrivate?: boolean  // Override to allow private URLs (e.g., for baseUrl config)
}): SSRFCheckResult {
  if (options?.allowPrivate) {
    return { allowed: true }
  }

  try {
    const url = new URL(urlString)

    // Check blocked hostnames
    const hostname = url.hostname.toLowerCase()
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return {
        allowed: false,
        reason: `Blocked hostname: ${hostname}`
      }
    }

    // Check if hostname is an IP address
    if (isIPAddress(hostname)) {
      if (isPrivateIP(hostname)) {
        return {
          allowed: false,
          reason: `Private IP address: ${hostname}`
        }
      }
    }

    // Check for localhost aliases
    if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return {
        allowed: false,
        reason: `Localhost alias: ${hostname}`
      }
    }

    // Check for file:// and other dangerous protocols
    const protocol = url.protocol.toLowerCase()
    if (!['http:', 'https:'].includes(protocol)) {
      return {
        allowed: false,
        reason: `Blocked protocol: ${protocol}`
      }
    }

    return { allowed: true }
  } catch (error) {
    return {
      allowed: false,
      reason: `Invalid URL: ${error instanceof Error ? error.message : 'unknown'}`
    }
  }
}

/**
 * Check if string is an IP address
 */
function isIPAddress(str: string): boolean {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str)) {
    return true
  }
  // IPv6
  if (str.includes(':')) {
    return true
  }
  return false
}

/**
 * Check if IP is in private range
 */
function isPrivateIP(ip: string): boolean {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ip)) {
      return true
    }
  }
  return false
}

/**
 * Safe fetch wrapper with SSRF protection
 */
export async function safeFetch(
  url: string,
  options?: RequestInit & { allowPrivate?: boolean }
): Promise<Response> {
  const check = checkSSRF(url, { allowPrivate: options?.allowPrivate })

  if (!check.allowed) {
    throw new Error(`[SSRF Guard] Request blocked: ${check.reason}`)
  }

  const { allowPrivate, ...fetchOptions } = options || {}
  return fetch(url, fetchOptions)
}

/**
 * Validate URL for media fetches (skills, images, etc.)
 */
export function validateMediaUrl(url: string): void {
  const check = checkSSRF(url)
  if (!check.allowed) {
    throw new Error(`[SSRF Guard] Media URL blocked: ${check.reason}`)
  }
}

/**
 * Check if URL points to internal infrastructure
 */
export function isInternalUrl(urlString: string): boolean {
  const check = checkSSRF(urlString)
  return !check.allowed
}
