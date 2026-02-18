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

// ── select_personality tool ──
// Allows switching IORS to any agent/personality from the vault

const selectPersonalityTool: ToolDefinition = {
  definition: {
    name: "select_personality",
    description:
      "Przełącz IORS w tryb konkretnego mentora/terapeuty/eksperta z bazy osobowości. Szuka po slug lub nazwie w exo_agents.",
    input_schema: {
      type: "object" as const,
      properties: {
        agent_slug_or_name: {
          type: "string",
          description:
            "Slug lub nazwa agenta/osobowości (np. 'dr-amanda-foster-clinical-psychologist' lub 'Wealth Pilot')",
        },
        session_only: {
          type: "boolean",
          description:
            "Tylko na czas sesji (true, default) vs permanentnie (false)",
        },
      },
      required: ["agent_slug_or_name"],
    },
  },
  execute: async (
    input: Record<string, unknown>,
    tenantId: string,
  ): Promise<string> => {
    const supabase = getServiceSupabase();
    const ref = input.agent_slug_or_name as string;
    const sessionOnly = (input.session_only as boolean) ?? true;

    logger.info("[PersonalityTools] select_personality:", { ref, tenantId });

    try {
      // Search by slug first, then by name (ilike)
      let agent;
      const { data: bySlug } = await supabase
        .from("exo_agents")
        .select("id, name, slug, system_prompt, type, tier, personality_config")
        .eq("slug", ref)
        .eq("active", true)
        .single();

      if (bySlug) {
        agent = bySlug;
      } else {
        const { data: byName } = await supabase
          .from("exo_agents")
          .select(
            "id, name, slug, system_prompt, type, tier, personality_config",
          )
          .ilike("name", `%${ref}%`)
          .eq("active", true)
          .limit(1)
          .single();

        agent = byName;
      }

      if (!agent) {
        return `Nie znaleziono osobowości "${ref}". Użyj list_agents aby znaleźć dostępne osobowości.`;
      }

      // Get greeting from personality_config
      const config =
        (agent.personality_config as Record<string, unknown>) || {};
      const greeting = (config.greeting as string) || "";

      if (sessionOnly) {
        // Store as session override (not persisted to tenant)
        return [
          `Przełączono na: **${agent.name}**`,
          `Typ: ${agent.type} | Tier: ${agent.tier}`,
          greeting ? `\n${greeting}` : "",
          `\n_System prompt aktywny na czas sesji. Użyj ponownie aby przełączyć się z powrotem._`,
          `\n__SESSION_PERSONALITY_OVERRIDE__:${agent.id}`,
        ]
          .filter(Boolean)
          .join("\n");
      } else {
        // Persist as tenant's default IORS personality override
        const { error } = await supabase
          .from("exo_tenants")
          .update({
            iors_personality: {
              personality_override_agent_id: agent.id,
              personality_override_name: agent.name,
              personality_override_slug: agent.slug,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId);

        if (error) {
          return `Błąd zapisu: ${error.message}`;
        }

        return [
          `Permanentnie przełączono na: **${agent.name}**`,
          `Typ: ${agent.type} | Tier: ${agent.tier}`,
          greeting ? `\n${greeting}` : "",
          `\n_Aby przywrócić domyślną osobowość, użyj adjust_personality._`,
        ]
          .filter(Boolean)
          .join("\n");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[PersonalityTools] select_personality error:", {
        error: msg,
      });
      return `Błąd: ${msg}`;
    }
  },
};

// Add select_personality to the exported array
personalityTools.push(selectPersonalityTool);

/**
 * Clamp a value to 0-100 range, falling back to current value if undefined.
 */
function clamp(newVal: number | undefined | null, currentVal: number): number {
  if (newVal === undefined || newVal === null) return currentVal;
  return Math.max(0, Math.min(100, Math.round(newVal)));
}
