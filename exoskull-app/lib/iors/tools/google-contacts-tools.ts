/**
 * IORS Google Contacts Tools
 *
 * Exposes Google Contacts (People API) as IORS tools callable by AI.
 * Allows the agent to search, list, and look up user's contacts.
 */

import type { ToolDefinition } from "./shared";
import {
  searchContacts,
  listContacts,
  getContact,
} from "@/lib/integrations/google-contacts-adapter";

export const googleContactsTools: ToolDefinition[] = [
  {
    definition: {
      name: "search_contacts",
      description:
        "Wyszukaj kontakty Google uzytkownika po imieniu, nazwisku, emailu lub numerze telefonu. " +
        "Uzywaj gdy user pyta o kontakt do kogoś, szuka adresu email lub numeru telefonu osoby, " +
        "albo chce wyslac wiadomosc do kogos i nie zna adresu. " +
        "Zwraca imie, email, telefon, organizacje.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Fraza wyszukiwania — imie, nazwisko, email, telefon lub nazwa firmy",
          },
          max_results: {
            type: "number",
            description: "Ile wynikow zwrocic (domyslnie 30)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await searchContacts(
          tenantId,
          input.query as string,
          (input.max_results as number) || 30,
        );
        if (!result.ok) return result.error || "Blad wyszukiwania kontaktow.";
        return result.formatted!;
      } catch (err) {
        return `Blad Google Contacts: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "list_contacts",
      description:
        "Pokaz liste kontaktow Google uzytkownika (ostatnio modyfikowane). " +
        "Uzywaj gdy user chce zobaczyc swoje kontakty, przejrzec liste lub sprawdzic ile ma kontaktow.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Ile kontaktow pokazac (domyslnie 50, max 100)",
          },
          page_token: {
            type: "string",
            description:
              "Token nastepnej strony (z poprzedniego wyniku) — do paginacji",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      try {
        const limit = Math.min((input.limit as number) || 50, 100);
        const result = await listContacts(
          tenantId,
          limit,
          input.page_token as string | undefined,
        );
        if (!result.ok) return result.error || "Blad listowania kontaktow.";

        let output = `Kontakty Google (${result.contacts!.length}`;
        if (result.totalPeople) output += ` z ${result.totalPeople}`;
        output += `):\n${result.formatted}`;

        if (result.nextPageToken) {
          output += `\n\n[Nastepna strona: uzyj page_token="${result.nextPageToken}"]`;
        }

        return output;
      } catch (err) {
        return `Blad Google Contacts: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "get_contact_details",
      description:
        "Pobierz pelne dane konkretnego kontaktu Google po jego ID (resourceName). " +
        "Uzywaj po search_contacts lub list_contacts, gdy potrzebujesz wiecej szczegolow o osobie.",
      input_schema: {
        type: "object" as const,
        properties: {
          resource_name: {
            type: "string",
            description:
              'ID kontaktu (resourceName) z wynikow wyszukiwania, np. "people/c1234567890"',
          },
        },
        required: ["resource_name"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await getContact(
          tenantId,
          input.resource_name as string,
        );
        if (!result.ok) return result.error || "Nie udalo sie pobrac kontaktu.";
        return result.formatted!;
      } catch (err) {
        return `Blad Google Contacts: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
];
