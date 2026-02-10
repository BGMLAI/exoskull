/**
 * IORS Personality System
 *
 * Converts IORSPersonality parameters into a system prompt fragment
 * that dynamically shapes how IORS communicates with the user.
 *
 * The personality is stored in exo_tenants.iors_personality (JSONB)
 * and injected into the system prompt at each conversation turn.
 */

import { DEFAULT_PERSONALITY, type IORSPersonality } from "./types";

/**
 * Generate a system prompt fragment from personality parameters.
 * Returns empty string if all parameters are at default values.
 */
export function getPersonalityPromptFragment(
  personality: Partial<IORSPersonality> | null,
): string {
  const p = mergeWithDefaults(personality);
  const hints: string[] = [];

  // Name
  if (p.name && p.name !== "IORS") {
    hints.push(`Twoje imie to ${p.name}. Przedstawiaj sie tym imieniem.`);
  }

  // Language
  if (p.language === "pl") {
    hints.push("Mow zawsze po polsku.");
  } else if (p.language === "en") {
    hints.push("Always speak in English.");
  }
  // 'auto' = detect from user's language

  // Style axes — only add hints when significantly different from center (50)
  const { style } = p;

  if (style.formality >= 75) {
    hints.push("Mow formalnie, z szacunkiem, per Pan/Pani.");
  } else if (style.formality <= 25) {
    hints.push("Mow luznie, jak do kumpla. Mozesz per Ty.");
  }

  if (style.humor >= 75) {
    hints.push("Uzywaj humoru, zartuj, badz lekki.");
  } else if (style.humor <= 15) {
    hints.push("Badz powazny. Bez zartow.");
  }

  if (style.directness >= 75) {
    hints.push("Mow wprost, bez owijania w bawelne. Konkrety.");
  } else if (style.directness <= 25) {
    hints.push("Badz delikatny. Sugeruj zamiast mowic wprost.");
  }

  if (style.empathy >= 75) {
    hints.push("Okazuj emocje i wspolczucie. Reaguj na nastroj.");
  } else if (style.empathy <= 25) {
    hints.push("Badz rzeczowy. Fakty > emocje.");
  }

  if (style.detail_level >= 75) {
    hints.push("Podawaj szczegoly, wyjasniaj dokladnie.");
  } else if (style.detail_level <= 25) {
    hints.push("Ultra-krotko. Max 1-2 zdania na odpowiedz.");
  }

  // Proactivity
  if (p.proactivity >= 75) {
    hints.push(
      "Badz proaktywny — proponuj, sugeruj, dzialaj bez pytania (w ramach zgod).",
    );
  } else if (p.proactivity <= 25) {
    hints.push("Czekaj na instrukcje. Nie proponuj sam z siebie.");
  }

  // Communication hours
  if (
    p.communication_hours.start !== "07:00" ||
    p.communication_hours.end !== "23:00"
  ) {
    hints.push(
      `Godziny komunikacji: ${p.communication_hours.start}–${p.communication_hours.end}. Poza nimi — tylko awaryjnie.`,
    );
  }

  if (hints.length === 0) return "";
  return `\n\n## OSOBOWOSC IORS\n${hints.join("\n")}`;
}

// ── Behavior preset → prompt fragment mapping ──

const PRESET_PROMPTS: Record<string, string> = {
  // Style
  motivator:
    "Zachecaj, chwal postepy, podnos na duchu. Kazdy maly krok jest wazny.",
  coach:
    "Badz wymagajacy. Rozliczaj z commitmentow. Nie odpuszczaj. Pytaj o postepy.",
  analyst:
    "Dawaj dane, statystyki, trendy. Mniej emocji, wiecej faktow i liczb.",
  friend:
    "Badz ciepły, empatyczny, pytaj jak sie czuje. Wspieraj emocjonalnie.",
  // Proactivity
  plan_day:
    "Rano podaj plan dnia na podstawie taskow i kalendarza. Zaproponuj priorytety.",
  monitor_health:
    "Reaguj na spadki snu, energii, nastroju. Informuj o trendach zdrowotnych.",
  track_goals:
    "Co tydzien sprawdzaj postep celow i przypominaj. Proponuj dalsze kroki.",
  find_gaps:
    "Wykrywaj co uzytkownik pomija i delikatnie zwracaj uwage na zaniedbane obszary.",
  // Boundaries
  no_meditation: "NIGDY nie sugeruj medytacji ani mindfulness.",
  no_finance: "NIE poruszaj tematow finansowych. Pomijaj kwestie pieniedzy.",
  no_calls:
    "NIGDY nie wykonuj polaczen telefonicznych bez wyraznego polecenia.",
  weekend_quiet:
    "W weekendy (sobota, niedziela) — minimalna komunikacja. Tylko na pytanie.",
};

/**
 * Generate prompt fragment from behavior presets.
 */
export function getBehaviorPresetsFragment(
  presets: string[] | null | undefined,
): string {
  if (!presets || presets.length === 0) return "";
  const fragments = presets
    .filter((p) => PRESET_PROMPTS[p])
    .map((p) => `- ${PRESET_PROMPTS[p]}`);
  if (fragments.length === 0) return "";
  return `\n\n## AKTYWNE ZACHOWANIA\n${fragments.join("\n")}`;
}

/**
 * Generate prompt fragment from custom instructions.
 */
export function getCustomInstructionsFragment(
  instructions: string | null | undefined,
): string {
  if (!instructions || instructions.trim().length === 0) return "";
  const sanitized = instructions.slice(0, 2000).trim();
  return `\n\n## INSTRUKCJE UZYTKOWNIKA (najwyzszy priorytet)\n${sanitized}`;
}

/**
 * Parse personality from DB JSONB, merging with defaults for missing fields.
 */
export function parsePersonalityFromDB(jsonb: unknown): IORSPersonality {
  if (!jsonb || typeof jsonb !== "object") return { ...DEFAULT_PERSONALITY };

  const raw = jsonb as Partial<IORSPersonality>;
  return mergeWithDefaults(raw);
}

/**
 * Merge partial personality with defaults.
 */
function mergeWithDefaults(
  partial: Partial<IORSPersonality> | null | undefined,
): IORSPersonality {
  if (!partial) return { ...DEFAULT_PERSONALITY };

  return {
    name: partial.name ?? DEFAULT_PERSONALITY.name,
    voice_id: partial.voice_id ?? DEFAULT_PERSONALITY.voice_id,
    language: partial.language ?? DEFAULT_PERSONALITY.language,
    style: {
      formality:
        partial.style?.formality ?? DEFAULT_PERSONALITY.style.formality,
      humor: partial.style?.humor ?? DEFAULT_PERSONALITY.style.humor,
      directness:
        partial.style?.directness ?? DEFAULT_PERSONALITY.style.directness,
      empathy: partial.style?.empathy ?? DEFAULT_PERSONALITY.style.empathy,
      detail_level:
        partial.style?.detail_level ?? DEFAULT_PERSONALITY.style.detail_level,
    },
    proactivity: partial.proactivity ?? DEFAULT_PERSONALITY.proactivity,
    communication_hours: {
      start:
        partial.communication_hours?.start ??
        DEFAULT_PERSONALITY.communication_hours.start,
      end:
        partial.communication_hours?.end ??
        DEFAULT_PERSONALITY.communication_hours.end,
    },
  };
}
