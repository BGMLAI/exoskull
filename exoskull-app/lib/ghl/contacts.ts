/**
 * GHL Contacts Library
 *
 * Contact management via GHL API:
 * - CRUD operations
 * - Tags management
 * - Custom fields
 * - Notes and tasks
 */

import { GHLClient, ghlRateLimiter } from './client'

export interface Contact {
  id: string
  locationId: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  companyName?: string
  address1?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  website?: string
  timezone?: string
  dnd?: boolean
  dndSettings?: {
    Call?: { status: string }
    Email?: { status: string }
    SMS?: { status: string }
    WhatsApp?: { status: string }
    GMB?: { status: string }
    FB?: { status: string }
  }
  tags?: string[]
  source?: string
  customFields?: CustomFieldValue[]
  dateAdded?: string
  dateUpdated?: string
}

export interface CustomFieldValue {
  id: string
  key?: string
  fieldValue: string | string[] | boolean | number
}

export interface ContactTag {
  id: string
  name: string
  locationId: string
}

export interface CreateContactParams {
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  companyName?: string
  address1?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  website?: string
  timezone?: string
  dnd?: boolean
  tags?: string[]
  source?: string
  customFields?: CustomFieldValue[]
}

export interface UpdateContactParams extends Partial<CreateContactParams> {}

/**
 * Create a new contact
 */
export async function createContact(
  client: GHLClient,
  params: CreateContactParams
): Promise<{ contact: Contact }> {
  await ghlRateLimiter.throttle()

  const body = {
    ...params,
    locationId: client.getLocationId(),
  }

  return client.post<{ contact: Contact }>('/contacts/', body)
}

/**
 * Get contact by ID
 */
export async function getContact(
  client: GHLClient,
  contactId: string
): Promise<{ contact: Contact }> {
  await ghlRateLimiter.throttle()
  return client.get<{ contact: Contact }>(`/contacts/${contactId}`)
}

/**
 * Update a contact
 */
export async function updateContact(
  client: GHLClient,
  contactId: string,
  params: UpdateContactParams
): Promise<{ contact: Contact }> {
  await ghlRateLimiter.throttle()
  return client.put<{ contact: Contact }>(`/contacts/${contactId}`, params)
}

/**
 * Delete a contact
 */
export async function deleteContact(
  client: GHLClient,
  contactId: string
): Promise<{ succeded: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ succeded: boolean }>(`/contacts/${contactId}`)
}

/**
 * Search contacts
 */
export async function searchContacts(
  client: GHLClient,
  params: {
    query?: string
    email?: string
    phone?: string
    limit?: number
    skip?: number
  }
): Promise<{ contacts: Contact[]; total: number }> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()
  const queryParams: Record<string, string> = {
    locationId,
  }

  if (params.query) queryParams.query = params.query
  if (params.email) queryParams.email = params.email
  if (params.phone) queryParams.phone = params.phone
  if (params.limit) queryParams.limit = params.limit.toString()
  if (params.skip) queryParams.skip = params.skip.toString()

  return client.get<{ contacts: Contact[]; total: number }>('/contacts/', queryParams)
}

/**
 * Get contact by email
 */
export async function getContactByEmail(
  client: GHLClient,
  email: string
): Promise<Contact | null> {
  const result = await searchContacts(client, { email, limit: 1 })
  return result.contacts[0] || null
}

/**
 * Get contact by phone
 */
export async function getContactByPhone(
  client: GHLClient,
  phone: string
): Promise<Contact | null> {
  const result = await searchContacts(client, { phone, limit: 1 })
  return result.contacts[0] || null
}

/**
 * Add tags to contact
 */
export async function addContactTags(
  client: GHLClient,
  contactId: string,
  tags: string[]
): Promise<{ tags: string[] }> {
  await ghlRateLimiter.throttle()
  return client.post<{ tags: string[] }>(`/contacts/${contactId}/tags`, { tags })
}

/**
 * Remove tag from contact
 */
export async function removeContactTag(
  client: GHLClient,
  contactId: string,
  tag: string
): Promise<void> {
  await ghlRateLimiter.throttle()
  await client.delete(`/contacts/${contactId}/tags/${encodeURIComponent(tag)}`)
}

/**
 * Get all tags for location
 */
export async function getTags(
  client: GHLClient
): Promise<{ tags: ContactTag[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ tags: ContactTag[] }>('/locations/tags', { locationId })
}

/**
 * Create a tag
 */
export async function createTag(
  client: GHLClient,
  name: string
): Promise<{ tag: ContactTag }> {
  await ghlRateLimiter.throttle()
  return client.post<{ tag: ContactTag }>('/locations/tags', {
    locationId: client.getLocationId(),
    name,
  })
}

/**
 * Add note to contact
 */
export async function addContactNote(
  client: GHLClient,
  contactId: string,
  body: string
): Promise<{ note: { id: string; body: string } }> {
  await ghlRateLimiter.throttle()
  return client.post<{ note: { id: string; body: string } }>(
    `/contacts/${contactId}/notes`,
    { body }
  )
}

/**
 * Get contact notes
 */
export async function getContactNotes(
  client: GHLClient,
  contactId: string
): Promise<{ notes: Array<{ id: string; body: string; dateAdded: string }> }> {
  await ghlRateLimiter.throttle()
  return client.get<{ notes: Array<{ id: string; body: string; dateAdded: string }> }>(
    `/contacts/${contactId}/notes`
  )
}

/**
 * Add task to contact
 */
export async function addContactTask(
  client: GHLClient,
  contactId: string,
  task: {
    title: string
    body?: string
    dueDate: string
    completed?: boolean
    assignedTo?: string
  }
): Promise<{ task: { id: string } }> {
  await ghlRateLimiter.throttle()
  return client.post<{ task: { id: string } }>(`/contacts/${contactId}/tasks`, task)
}

/**
 * Get contact tasks
 */
export async function getContactTasks(
  client: GHLClient,
  contactId: string
): Promise<{ tasks: Array<{ id: string; title: string; dueDate: string; completed: boolean }> }> {
  await ghlRateLimiter.throttle()
  return client.get<{ tasks: Array<{ id: string; title: string; dueDate: string; completed: boolean }> }>(
    `/contacts/${contactId}/tasks`
  )
}

/**
 * Upsert contact (create or update by email/phone)
 */
export async function upsertContact(
  client: GHLClient,
  params: CreateContactParams
): Promise<{ contact: Contact; new: boolean }> {
  // Try to find existing contact
  let existing: Contact | null = null

  if (params.email) {
    existing = await getContactByEmail(client, params.email)
  }
  if (!existing && params.phone) {
    existing = await getContactByPhone(client, params.phone)
  }

  if (existing) {
    const { contact } = await updateContact(client, existing.id, params)
    return { contact, new: false }
  } else {
    const { contact } = await createContact(client, params)
    return { contact, new: true }
  }
}

/**
 * Bulk create contacts
 */
export async function bulkCreateContacts(
  client: GHLClient,
  contacts: CreateContactParams[]
): Promise<{ contacts: Contact[]; errors: Array<{ index: number; error: string }> }> {
  const results: Contact[] = []
  const errors: Array<{ index: number; error: string }> = []

  for (let i = 0; i < contacts.length; i++) {
    try {
      const { contact } = await createContact(client, contacts[i])
      results.push(contact)
    } catch (error) {
      errors.push({
        index: i,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { contacts: results, errors }
}
