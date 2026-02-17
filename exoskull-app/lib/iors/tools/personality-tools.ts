/**
 * IORS Personality Tools
 *
 * Tools for adjusting IORS personality parameters through conversation.
 * User can say "badz bardziej bezposredni" or "mow krocej" and IORS
 * adjusts its personality parameters accordingly.
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parsePersonalityFromDB } from "../personality";
import type { IORSPersonality } from "../types";
import { checkSelfModifyConsent, logSelfModification } from "./consent-gate";

import { logger } from "@/lib/logger";
/** Permission key mapping for personality parameters */
const PERSONALITY_PERM_MAP: Record<string, string> = {
  formality: "style_formality",
  humor: "style_humor",
  directness: "style_directness",
  empathy: "style_empathy",
  detail_level: "style_detail",
  proactivity: "proactivity",
};

export const personalityTools: ToolDefinition[] = [
  {
    definition: {
      name: "adjust_personality",
      description:
        "Zmien parametry osobowosci IORS. Uzytkownik prosi o zmiane stylu komunikacji (np. 'badz bardziej bezposredni', 'mow krocej', 'wiecej humoru', 'zmien imie na X').",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nowe imie IORS (jesli user chce zmienic)",
          },
          formality: {
            type: "number",
            description: "Formalnosc 0-100 (0=luznie, 100=formalnie)",
          },
          humor: {
            type: "number",
            description: "Humor 0-100 (0=powaznie, 100=zabawnie)",
          },
          directness: {
            type: "number",
            description: "Bezposredniosc 0-100 (0=delikatnie, 100=wprost)",
          },
          empathy: {
            type: "number",
            description: "Empatia 0-100 (0=rzeczowo, 100=emocjonalnie)",
          },
          detail_level: {
            type: "number",
            description:
              "Poziom szczegolow 0-100 (0=ultra-krotko, 100=szczegolowo)",
          },
          proactivity: {
            type: "number",
            description:
              "Proaktywnosc 0-100 (0=czekaj na pytanie, 100=dzialaj sam)",
          },
          language: {
            type: "string",
            enum: ["pl", "en", "auto"],
            description: "Jezyk komunikacji",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const isDirectRequest = (input._direct_request as boolean) ?? true; // personality changes via chat are direct

      // Load current personality
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("iors_personality, iors_name")
        .eq("id", tenantId)
        .single();

      const current = parsePersonalityFromDB(tenant?.iors_personality);
      const changes: string[] = [];
      const proposed: string[] = [];
      const denied: string[] = [];

      // Check consent for each parameter being changed
      const updated: IORSPersonality = { ...current };
      updated.style = { ...current.style };

      // Name + language don't need consent (cosmetic)
      updated.name = (input.name as string) ?? current.name;
      updated.language =
        (input.language as IORSPersonality["language"]) ?? current.language;
      if (input.name) changes.push(`imie: ${input.name}`);
      if (input.language) changes.push(`jezyk: ${input.language}`);

      // Style axes + proactivity — check consent per parameter
      for (const [inputKey, permKey] of Object.entries(PERSONALITY_PERM_MAP)) {
        const newVal = input[inputKey] as number | undefined;
        if (newVal === undefined) continue;

        const consent = await checkSelfModifyConsent(
          tenantId,
          permKey,
          isDirectRequest,
        );

        const currentVal =
          inputKey === "proactivity"
            ? current.proactivity
            : current.style[inputKey as keyof typeof current.style];

        if (consent.mode === "denied") {
          denied.push(inputKey);
          continue;
        }

        if (consent.mode === "needs_approval") {
          await logSelfModification({
            tenantId,
            parameterName: inputKey,
            permissionKey: permKey,
            beforeState: currentVal,
            afterState: newVal,
            status: "proposed",
          });
          proposed.push(`${inputKey}: ${currentVal} → ${newVal}`);
          continue;
        }

        // Allowed — apply
        const clamped = clamp(newVal, currentVal);
        if (inputKey === "proactivity") {
          updated.proactivity = clamped;
        } else {
          (updated.style as Record<string, number>)[inputKey] = clamped;
        }
        changes.push(`${inputKey}: ${clamped}/100`);

        await logSelfModification({
          tenantId,
          parameterName: inputKey,
          permissionKey: permKey,
          beforeState: currentVal,
          afterState: clamped,
          status: "applied",
        });
      }

      // Save to DB (only if there are actual changes)
      if (changes.length > 0) {
        const { error } = await supabase
          .from("exo_tenants")
          .update({
            iors_personality: updated,
            iors_name: updated.name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId);

        if (error) {
          logger.error("[PersonalityTools] Failed to update:", {
            tenantId,
            error: error.message,
          });
          return "Nie udalo sie zaktualizowac osobowosci. Sprobuj ponownie.";
        }
      }

      // Build response
      const parts: string[] = [];
      if (changes.length > 0) {
        parts.push(`Zaktualizowano: ${changes.join(", ")}.`);
      }
      if (proposed.length > 0) {
        parts.push(
          `Zaproponowano (czeka na zatwierdzenie): ${proposed.join(", ")}.`,
        );
      }
      if (denied.length > 0) {
        parts.push(
          `Odmowa (brak uprawnien): ${denied.join(", ")}. Wlacz w Ustawienia → Optymalizacja.`,
        );
      }
      if (parts.length === 0) {
        return "Nie zmieniono zadnych parametrow.";
      }

      return parts.join(" ") + " Zmiana obowiazuje od nastepnej wiadomosci.";
    },
  },
];

/**
 * Clamp a value to 0-100 range, falling back to current value if undefined.
 */
function clamp(newVal: number | undefined | null, currentVal: number): number {
  if (newVal === undefined || newVal === null) return currentVal;
  return Math.max(0, Math.min(100, Math.round(newVal)));
}
