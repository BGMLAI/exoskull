/**
 * Timezone Utility Functions for ExoSkull CRON
 */

// Supported IANA timezones
export const SUPPORTED_TIMEZONES = [
  'Europe/Warsaw',       // Poland (default)
  'Europe/Madrid',       // Spain
  'Europe/London',       // UK
  'Europe/Berlin',       // Germany
  'Europe/Paris',        // France
  'America/New_York',    // US East
  'America/Chicago',     // US Central
  'America/Los_Angeles', // US West
  'Asia/Tokyo',          // Japan
  'Australia/Sydney',    // Australia
  'UTC'                  // Fallback
] as const

export type SupportedTimezone = typeof SUPPORTED_TIMEZONES[number]

/**
 * Get current time in user's timezone
 */
export function getUserLocalTime(timezone: string): Date {
  try {
    const now = new Date()
    const localString = now.toLocaleString('en-US', {
      timeZone: timezone || 'Europe/Warsaw'
    })
    return new Date(localString)
  } catch {
    // Fallback to UTC
    return new Date()
  }
}

/**
 * Get hour in user's timezone (0-23)
 */
export function getUserLocalHour(timezone: string): number {
  const localTime = getUserLocalTime(timezone)
  return localTime.getHours()
}

/**
 * Get minute in user's timezone (0-59)
 */
export function getUserLocalMinute(timezone: string): number {
  const localTime = getUserLocalTime(timezone)
  return localTime.getMinutes()
}

/**
 * Check if current time is within a time window (in user's timezone)
 * Only returns true at the START of the window (within first 10 minutes)
 */
export function isTimeToTrigger(
  timezone: string,
  targetTime: string,  // "06:00"
  windowMinutes: number = 10
): boolean {
  try {
    const localTime = getUserLocalTime(timezone)
    const currentHour = localTime.getHours()
    const currentMinute = localTime.getMinutes()

    const [targetHour, targetMinute] = targetTime.split(':').map(Number)

    // Check if we're at the target hour and within the window
    if (currentHour === targetHour && currentMinute < windowMinutes) {
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Check if current time is within a time window (broader check)
 */
export function isWithinTimeWindow(
  timezone: string,
  windowStart: string,  // "06:00"
  windowEnd: string     // "10:00"
): boolean {
  try {
    const localTime = getUserLocalTime(timezone)
    const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes()

    const [startHour, startMin] = windowStart.split(':').map(Number)
    const [endHour, endMin] = windowEnd.split(':').map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } catch {
    return false
  }
}

/**
 * Check if it's a weekend in user's timezone
 */
export function isWeekend(timezone: string): boolean {
  const localTime = getUserLocalTime(timezone)
  const dayOfWeek = localTime.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6  // Sunday = 0, Saturday = 6
}

/**
 * Get day of week in user's timezone (0 = Sunday, 1 = Monday, etc.)
 */
export function getDayOfWeek(timezone: string): number {
  const localTime = getUserLocalTime(timezone)
  return localTime.getDay()
}

/**
 * Get day of month in user's timezone (1-31)
 */
export function getDayOfMonth(timezone: string): number {
  const localTime = getUserLocalTime(timezone)
  return localTime.getDate()
}

/**
 * Check if user is in quiet hours
 */
export function isInQuietHours(
  timezone: string,
  quietStart: string = '22:00',
  quietEnd: string = '07:00'
): boolean {
  try {
    const localTime = getUserLocalTime(timezone)
    const currentHour = localTime.getHours()

    const [startHour] = quietStart.split(':').map(Number)
    const [endHour] = quietEnd.split(':').map(Number)

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startHour > endHour) {
      return currentHour >= startHour || currentHour < endHour
    }

    return currentHour >= startHour && currentHour < endHour
  } catch {
    return false
  }
}

/**
 * Format time for display
 */
export function formatLocalTime(timezone: string): string {
  try {
    const now = new Date()
    return now.toLocaleString('pl-PL', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long'
    })
  } catch {
    return new Date().toLocaleTimeString()
  }
}

/**
 * Get timezone offset from UTC in hours
 */
export function getTimezoneOffset(timezone: string): number {
  try {
    const now = new Date()
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    return Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60))
  } catch {
    return 0
  }
}
