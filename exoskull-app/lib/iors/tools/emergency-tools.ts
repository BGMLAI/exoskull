/**
 * IORS Emergency Contact Tools
 *
 * Tools for managing emergency contacts through conversation.
 * - set_emergency_contact: Add/update emergency contact
 * - verify_emergency_contact: Verify with code
 */

import type { ToolDefinition } from "./index";
import {
  addEmergencyContact,
  verifyEmergencyContact,
  getPrimaryEmergencyContact,
} from "../emergency-contact";

export const emergencyTools: ToolDefinition[] = [
  {
    definition: {
      name: "set_emergency_contact",
      description:
        "Dodaj lub zmien kontakt zaufania (awaryjny). IORS zadzwoni/napisze do tej osoby w sytuacji kryzysowej. Kazdy uzytkownik POWINIEN miec kontakt zaufania.",
      input_schema: {
        type: "object" as const,
        properties: {
          phone: {
            type: "string",
            description:
              "Numer telefonu kontaktu (np. +48123456789 lub 123456789)",
          },
          name: {
            type: "string",
            description: "Imie kontaktu",
          },
          relationship: {
            type: "string",
            enum: ["friend", "family", "partner", "therapist", "other"],
            description: "Relacja z uzytkownikiem",
          },
        },
        required: ["phone"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await addEmergencyContact(
        tenantId,
        input.phone as string,
        input.name as string | undefined,
        input.relationship as string | undefined,
      );

      if (!result.contactId) {
        return "Nie udalo sie dodac kontaktu. Sprawdz numer telefonu i sprobuj ponownie.";
      }

      if (result.verificationSent) {
        return `Kontakt dodany! Wyslalem SMS z kodem weryfikacyjnym na ${input.phone}. Poproszono o podanie kodu — przekaz go osobie kontaktowej lub podaj mi go jak Ci go przesliza.`;
      }

      return `Kontakt dodany, ale nie udalo sie wyslac SMS weryfikacyjnego. Sprobuje ponownie pozniej.`;
    },
  },
  {
    definition: {
      name: "verify_emergency_contact",
      description:
        "Zweryfikuj kontakt zaufania kodem z SMS. Uzytkownik podaje kod ktory otrzymal kontakt.",
      input_schema: {
        type: "object" as const,
        properties: {
          code: {
            type: "string",
            description: "6-cyfrowy kod weryfikacyjny",
          },
        },
        required: ["code"],
      },
    },
    execute: async (input, tenantId) => {
      const contact = await getPrimaryEmergencyContact(tenantId);
      if (!contact) {
        return "Nie masz ustawionego kontaktu zaufania. Najpierw dodaj kontakt.";
      }

      const verified = await verifyEmergencyContact(
        contact.id,
        input.code as string,
      );

      if (verified) {
        const name = contact.name ? ` (${contact.name})` : "";
        return `Kontakt zaufania${name} zweryfikowany! W razie kryzysu bede mogl sie z nim/nia skontaktowac.`;
      }

      return "Nieprawidlowy kod lub kod wygasl. Sprawdz i sprobuj ponownie.";
    },
  },
];
