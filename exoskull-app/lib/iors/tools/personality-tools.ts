/**
 * IORS Personality Tools
 *
 * Tools for adjusting IORS personality parameters through conversation.
 * User can say "badz bardziej bezposredni" or "mow krocej" and IORS
 * adjusts its personality parameters accordingly.
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parsePersonalityFromDB } from "../personality";
import type { IORSPersonality } from "../types";

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

      // Load current personality
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("iors_personality, iors_name")
        .eq("id", tenantId)
        .single();

      const current = parsePersonalityFromDB(tenant?.iors_personality);

      // Apply changes
      const updated: IORSPersonality = {
        ...current,
        name: (input.name as string) ?? current.name,
        language:
          (input.language as IORSPersonality["language"]) ?? current.language,
        proactivity: clamp(input.proactivity as number, current.proactivity),
        style: {
          formality: clamp(input.formality as number, current.style.formality),
          humor: clamp(input.humor as number, current.style.humor),
          directness: clamp(
            input.directness as number,
            current.style.directness,
          ),
          empathy: clamp(input.empathy as number, current.style.empathy),
          detail_level: clamp(
            input.detail_level as number,
            current.style.detail_level,
          ),
        },
      };

      // Save to DB
      const { error } = await supabase
        .from("exo_tenants")
        .update({
          iors_personality: updated,
          iors_name: updated.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      if (error) {
        console.error("[PersonalityTools] Failed to update:", {
          tenantId,
          error: error.message,
        });
        return "Nie udalo sie zaktualizowac osobowosci. Sprobuj ponownie.";
      }

      // Build confirmation of what changed
      const changes: string[] = [];
      if (input.name) changes.push(`imie: ${input.name}`);
      if (input.formality !== undefined)
        changes.push(`formalnosc: ${input.formality}/100`);
      if (input.humor !== undefined) changes.push(`humor: ${input.humor}/100`);
      if (input.directness !== undefined)
        changes.push(`bezposredniosc: ${input.directness}/100`);
      if (input.empathy !== undefined)
        changes.push(`empatia: ${input.empathy}/100`);
      if (input.detail_level !== undefined)
        changes.push(`szczegoly: ${input.detail_level}/100`);
      if (input.proactivity !== undefined)
        changes.push(`proaktywnosc: ${input.proactivity}/100`);
      if (input.language) changes.push(`jezyk: ${input.language}`);

      return `Zaktualizowano: ${changes.join(", ")}. Zmiana obowiazuje od nastepnej wiadomosci.`;
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
