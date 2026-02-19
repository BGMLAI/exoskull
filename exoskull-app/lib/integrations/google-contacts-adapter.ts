/**
 * Google Contacts Direct Adapter
 *
 * Direct REST API access to Google People API for contact lookup.
 * Used by IORS tools so the AI agent can search/list user's Google Contacts.
 *
 * Requires: Google OAuth2 credentials with contacts.readonly scope.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { logger } from "@/lib/logger";

const PEOPLE_API = "https://people.googleapis.com/v1";

const PERSON_FIELDS =
  "names,emailAddresses,phoneNumbers,organizations,photos,biographies,addresses";

// Token stored in exo_rig_connections — unified google rig includes contacts scope
const GOOGLE_CONTACT_SLUGS = ["google", "google-workspace"];

// ---------------------------------------------------------------------------
// TOKEN
// ---------------------------------------------------------------------------

async function getValidToken(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();

  for (const slug of GOOGLE_CONTACT_SLUGS) {
    const { data: connection } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (connection?.access_token) {
      try {
        return await ensureFreshToken(connection);
      } catch (err) {
        logger.error(`[GoogleContacts] Token refresh failed for ${slug}:`, err);
        continue;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// FETCH HELPER
// ---------------------------------------------------------------------------

async function peopleFetch<T>(
  tenantId: string,
  path: string,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token)
    return {
      ok: false,
      error:
        "Brak tokenu Google Contacts. Polacz konto Google w ustawieniach (Rigs).",
    };

  try {
    const res = await fetch(`${PEOPLE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `Google People API ${res.status}: ${errText}`,
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleContacts] Fetch error:", { path, error: msg });
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export interface Contact {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
  organization?: string;
  photoUrl?: string;
  notes?: string;
  address?: string;
}

interface PeopleConnection {
  resourceName: string;
  names?: { displayName: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string }[];
  organizations?: { name: string; title?: string }[];
  photos?: { url: string }[];
  biographies?: { value: string }[];
  addresses?: { formattedValue: string }[];
}

function mapContact(c: PeopleConnection): Contact {
  return {
    resourceName: c.resourceName,
    name: c.names?.[0]?.displayName || "Unknown",
    emails: (c.emailAddresses || []).map((e) => e.value),
    phones: (c.phoneNumbers || []).map((p) => p.value),
    organization: c.organizations?.[0]
      ? `${c.organizations[0].name}${c.organizations[0].title ? ` (${c.organizations[0].title})` : ""}`
      : undefined,
    photoUrl: c.photos?.[0]?.url,
    notes: c.biographies?.[0]?.value,
    address: c.addresses?.[0]?.formattedValue,
  };
}

function formatContact(c: Contact): string {
  const parts = [`**${c.name}**`];
  if (c.emails.length) parts.push(`Email: ${c.emails.join(", ")}`);
  if (c.phones.length) parts.push(`Tel: ${c.phones.join(", ")}`);
  if (c.organization) parts.push(`Org: ${c.organization}`);
  if (c.address) parts.push(`Adres: ${c.address}`);
  if (c.notes) parts.push(`Notatki: ${c.notes}`);
  return parts.join(" | ");
}

/**
 * Search contacts by query string (name, email, phone — server-side search).
 * Uses People API searchContacts endpoint.
 */
export async function searchContacts(
  tenantId: string,
  query: string,
  pageSize: number = 30,
): Promise<{
  ok: boolean;
  contacts?: Contact[];
  formatted?: string;
  error?: string;
}> {
  const result = await peopleFetch<{
    results?: { person: PeopleConnection }[];
  }>(
    tenantId,
    `/people:searchContacts?query=${encodeURIComponent(query)}&readMask=${PERSON_FIELDS}&pageSize=${pageSize}`,
  );

  if (!result.ok) return { ok: false, error: result.error };

  const contacts = (result.data?.results || []).map((r) =>
    mapContact(r.person),
  );

  if (!contacts.length) {
    return {
      ok: true,
      contacts: [],
      formatted: `Nie znaleziono kontaktow pasujacych do "${query}".`,
    };
  }

  const formatted = contacts
    .map((c, i) => `${i + 1}. ${formatContact(c)}`)
    .join("\n");
  return { ok: true, contacts, formatted };
}

/**
 * List all contacts (paginated). Returns first page.
 */
export async function listContacts(
  tenantId: string,
  pageSize: number = 50,
  pageToken?: string,
): Promise<{
  ok: boolean;
  contacts?: Contact[];
  formatted?: string;
  nextPageToken?: string;
  totalPeople?: number;
  error?: string;
}> {
  let path = `/people/me/connections?personFields=${PERSON_FIELDS}&pageSize=${pageSize}&sortOrder=LAST_MODIFIED_DESCENDING`;
  if (pageToken) path += `&pageToken=${pageToken}`;

  const result = await peopleFetch<{
    connections?: PeopleConnection[];
    nextPageToken?: string;
    totalPeople?: number;
  }>(tenantId, path);

  if (!result.ok) return { ok: false, error: result.error };

  const contacts = (result.data?.connections || []).map(mapContact);
  const formatted = contacts
    .map((c, i) => `${i + 1}. ${formatContact(c)}`)
    .join("\n");

  return {
    ok: true,
    contacts,
    formatted,
    nextPageToken: result.data?.nextPageToken,
    totalPeople: result.data?.totalPeople,
  };
}

/**
 * Get a single contact by resourceName (e.g. "people/c1234567890").
 */
export async function getContact(
  tenantId: string,
  resourceName: string,
): Promise<{
  ok: boolean;
  contact?: Contact;
  formatted?: string;
  error?: string;
}> {
  const result = await peopleFetch<PeopleConnection>(
    tenantId,
    `/${resourceName}?personFields=${PERSON_FIELDS}`,
  );

  if (!result.ok) return { ok: false, error: result.error };

  const contact = mapContact(result.data!);
  return { ok: true, contact, formatted: formatContact(contact) };
}
