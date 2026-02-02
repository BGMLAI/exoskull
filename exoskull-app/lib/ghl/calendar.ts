/**
 * GHL Calendar Library
 *
 * Calendar and appointment management via GHL API:
 * - Calendar CRUD
 * - Appointment booking
 * - Availability management
 * - Event management
 */

import { GHLClient, ghlRateLimiter } from './client'

export interface Calendar {
  id: string
  locationId: string
  name: string
  description?: string
  slug?: string
  widgetSlug?: string
  calendarType?: 'round_robin' | 'event' | 'class_booking' | 'service_booking'
  teamMembers?: string[]
  eventType?: string
  eventTitle?: string
  eventColor?: string
  slotDuration?: number
  slotInterval?: number
  slotBuffer?: number
  preBuffer?: number
  appoinmentPerSlot?: number
  appoinmentPerDay?: number
  openHours?: OpenHours[]
  enableRecurring?: boolean
  recurring?: RecurringSettings
  formId?: string
  stickyContact?: boolean
  isLivePaymentMode?: boolean
  autoConfirm?: boolean
  shouldSendAlertEmailsToAssignedMember?: boolean
  alertEmail?: string
  googleInvitationEmails?: boolean
  allowReschedule?: boolean
  allowCancellation?: boolean
  shouldAssignContactToTeamMember?: boolean
  shouldSkipAssigningContactForExisting?: boolean
  notes?: string
  pixelId?: string
  formSubmitType?: string
  formSubmitRedirectURL?: string
  formSubmitThanksMessage?: string
  availabilityType?: number
  guestType?: string
  consentLabel?: string
}

export interface OpenHours {
  daysOfTheWeek: number[]
  hours: Array<{ openHour: number; openMinute: number; closeHour: number; closeMinute: number }>
}

export interface RecurringSettings {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  count?: number
  endDate?: string
}

export interface Appointment {
  id: string
  calendarId: string
  locationId: string
  contactId: string
  groupId?: string
  appointmentStatus: 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'invalid'
  assignedUserId?: string
  title?: string
  notes?: string
  startTime: string
  endTime: string
  dateAdded?: string
  dateUpdated?: string
}

export interface CreateAppointmentParams {
  calendarId: string
  contactId: string
  startTime: string
  endTime: string
  title?: string
  notes?: string
  appointmentStatus?: 'new' | 'confirmed'
  assignedUserId?: string
  address?: string
  ignoreDateRange?: boolean
  toNotify?: boolean
}

export interface TimeSlot {
  startTime: string
  endTime: string
}

export interface FreeSlotQuery {
  calendarId: string
  startDate: string
  endDate: string
  timezone?: string
  userId?: string
}

/**
 * Get all calendars
 */
export async function getCalendars(
  client: GHLClient
): Promise<{ calendars: Calendar[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ calendars: Calendar[] }>('/calendars/', { locationId })
}

/**
 * Get calendar by ID
 */
export async function getCalendar(
  client: GHLClient,
  calendarId: string
): Promise<{ calendar: Calendar }> {
  await ghlRateLimiter.throttle()
  return client.get<{ calendar: Calendar }>(`/calendars/${calendarId}`)
}

/**
 * Create a calendar
 */
export async function createCalendar(
  client: GHLClient,
  params: Partial<Calendar>
): Promise<{ calendar: Calendar }> {
  await ghlRateLimiter.throttle()
  return client.post<{ calendar: Calendar }>('/calendars/', {
    ...params,
    locationId: client.getLocationId(),
  })
}

/**
 * Update a calendar
 */
export async function updateCalendar(
  client: GHLClient,
  calendarId: string,
  params: Partial<Calendar>
): Promise<{ calendar: Calendar }> {
  await ghlRateLimiter.throttle()
  return client.put<{ calendar: Calendar }>(`/calendars/${calendarId}`, params)
}

/**
 * Delete a calendar
 */
export async function deleteCalendar(
  client: GHLClient,
  calendarId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ success: boolean }>(`/calendars/${calendarId}`)
}

/**
 * Get free slots
 */
export async function getFreeSlots(
  client: GHLClient,
  params: FreeSlotQuery
): Promise<{ slots: Record<string, TimeSlot[]> }> {
  await ghlRateLimiter.throttle()

  const queryParams: Record<string, string> = {
    startDate: params.startDate,
    endDate: params.endDate,
  }

  if (params.timezone) queryParams.timezone = params.timezone
  if (params.userId) queryParams.userId = params.userId

  return client.get<{ slots: Record<string, TimeSlot[]> }>(
    `/calendars/${params.calendarId}/free-slots`,
    queryParams
  )
}

/**
 * Create an appointment
 */
export async function createAppointment(
  client: GHLClient,
  params: CreateAppointmentParams
): Promise<{ appointment: Appointment }> {
  await ghlRateLimiter.throttle()
  return client.post<{ appointment: Appointment }>('/calendars/events/appointments', {
    ...params,
    locationId: client.getLocationId(),
  })
}

/**
 * Get appointment by ID
 */
export async function getAppointment(
  client: GHLClient,
  appointmentId: string
): Promise<{ appointment: Appointment }> {
  await ghlRateLimiter.throttle()
  return client.get<{ appointment: Appointment }>(`/calendars/events/appointments/${appointmentId}`)
}

/**
 * Update an appointment
 */
export async function updateAppointment(
  client: GHLClient,
  appointmentId: string,
  params: Partial<CreateAppointmentParams>
): Promise<{ appointment: Appointment }> {
  await ghlRateLimiter.throttle()
  return client.put<{ appointment: Appointment }>(
    `/calendars/events/appointments/${appointmentId}`,
    params
  )
}

/**
 * Delete/cancel an appointment
 */
export async function deleteAppointment(
  client: GHLClient,
  appointmentId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ success: boolean }>(`/calendars/events/appointments/${appointmentId}`)
}

/**
 * Get appointments for a calendar
 */
export async function getAppointments(
  client: GHLClient,
  params: {
    calendarId?: string
    contactId?: string
    startTime?: string
    endTime?: string
    status?: string
    limit?: number
    skip?: number
  }
): Promise<{ events: Appointment[] }> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()
  const queryParams: Record<string, string> = {
    locationId,
  }

  if (params.calendarId) queryParams.calendarId = params.calendarId
  if (params.contactId) queryParams.contactId = params.contactId
  if (params.startTime) queryParams.startTime = params.startTime
  if (params.endTime) queryParams.endTime = params.endTime
  if (params.status) queryParams.status = params.status
  if (params.limit) queryParams.limit = params.limit.toString()
  if (params.skip) queryParams.skip = params.skip.toString()

  return client.get<{ events: Appointment[] }>('/calendars/events', queryParams)
}

/**
 * Book appointment with automatic slot selection
 */
export async function bookNextAvailableSlot(
  client: GHLClient,
  calendarId: string,
  contactId: string,
  params: {
    preferredDate?: string
    durationMinutes?: number
    title?: string
    notes?: string
    timezone?: string
  }
): Promise<{ appointment: Appointment; slotUsed: TimeSlot } | null> {
  const startDate = params.preferredDate || new Date().toISOString().split('T')[0]
  const endDate = new Date(new Date(startDate).getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { slots } = await getFreeSlots(client, {
    calendarId,
    startDate,
    endDate,
    timezone: params.timezone,
  })

  // Find first available slot
  for (const date of Object.keys(slots).sort()) {
    const daySlots = slots[date]
    if (daySlots && daySlots.length > 0) {
      const slot = daySlots[0]

      const { appointment } = await createAppointment(client, {
        calendarId,
        contactId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        title: params.title,
        notes: params.notes,
        appointmentStatus: 'new',
      })

      return { appointment, slotUsed: slot }
    }
  }

  return null
}

/**
 * Check if contact has upcoming appointments
 */
export async function hasUpcomingAppointment(
  client: GHLClient,
  contactId: string
): Promise<boolean> {
  const now = new Date().toISOString()
  const { events } = await getAppointments(client, {
    contactId,
    startTime: now,
    limit: 1,
  })

  return events.length > 0
}
