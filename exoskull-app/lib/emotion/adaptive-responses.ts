/**
 * Emotion-Adaptive Response System — Layer 11
 *
 * Generates prompt injections that adapt Claude's response style
 * based on the user's detected emotional state.
 *
 * 5 active modes + neutral (no adaptation).
 */

import type { EmotionState, AdaptivePrompt, ResponseMode } from "./types";

// ============================================================================
// MODE DETERMINATION
// ============================================================================

function determineResponseMode(emotion: EmotionState): ResponseMode {
  // High sadness (intensity > 60)
  if (emotion.primary_emotion === "sad" && emotion.intensity > 60) {
    return "high_sadness";
  }

  // High anger (intensity > 60)
  if (emotion.primary_emotion === "angry" && emotion.intensity > 60) {
    return "high_anger";
  }

  // Anxiety: high arousal + negative valence
  if (emotion.arousal > 0.7 && emotion.valence < -0.3) {
    return "anxiety";
  }

  // Low energy: low arousal + low/negative valence
  if (emotion.arousal < 0.3 && emotion.valence < 0.3) {
    return "low_energy";
  }

  // Mixed signals: many strong secondary emotions
  if (emotion.secondary_emotions.length >= 3) {
    return "mixed_signals";
  }

  return "neutral";
}

// ============================================================================
// PROMPT GENERATORS
// ============================================================================

const PROMPTS: Record<ResponseMode, (e: EmotionState) => AdaptivePrompt> = {
  high_sadness: (e) => ({
    mode: "high_sadness",
    instruction: `STAN EMOCJONALNY: Smutek/przygnębienie (intensywność: ${e.intensity}/100)

DOSTOSUJ ODPOWIEDŹ:
- Ciepły, wspierający ton
- Potwierdź uczucia: "To brzmi naprawdę ciężko."
- Unikaj toksycznej pozytywności ("głowa do góry!", "myśl pozytywnie!")
- Oferuj obecność: "Jestem tu. Chcesz o tym porozmawiać?"
- Sugeruj małe, osiągalne działania
- Sprawdź: "Jak mogę Cię teraz wesprzeć?"
- Krótsze odpowiedzi (nie przytłaczaj)`,
    tone_hints: ["warm", "validating", "present", "gentle"],
  }),

  high_anger: (e) => ({
    mode: "high_anger",
    instruction: `STAN EMOCJONALNY: Złość/frustracja (intensywność: ${e.intensity}/100)

DOSTOSUJ ODPOWIEDŹ:
- Potwierdź złość: "Ma sens, że jesteś zły z tego powodu."
- NIGDY nie mów "uspokój się" (to unieważnia emocje)
- Nie bierz tego osobiście
- Daj przestrzeń na wyrzucenie z siebie
- Pomóż znaleźć źródło: "Co jest najbardziej frustrujące?"
- Zaproponuj działanie: "Co by teraz pomogło?"`,
    tone_hints: ["validating", "direct", "respectful", "non-defensive"],
  }),

  anxiety: (e) => ({
    mode: "anxiety",
    instruction: `STAN EMOCJONALNY: Lęk/niepokój (pobudzenie: ${e.arousal.toFixed(2)}, intensywność: ${e.intensity}/100)

DOSTOSUJ ODPOWIEDŹ:
- Spokojny, uziemiający ton
- Podziel przytłaczające sytuacje na małe kroki
- Dawaj pewność z dowodami: "Radziłeś sobie z X wcześniej."
- Skup na kontrolowalnym: "Skupmy się na tym co możesz zrobić teraz."
- Zaproponuj oddychanie jeśli odpowiednie (box breathing: 4-4-4-4)
- Nie dodawaj presji ani pilności`,
    tone_hints: ["calm", "grounding", "reassuring", "structured"],
  }),

  low_energy: (e) => ({
    mode: "low_energy",
    instruction: `STAN EMOCJONALNY: Niska energia/zmęczenie (pobudzenie: ${e.arousal.toFixed(2)}, walencja: ${e.valence.toFixed(2)})

DOSTOSUJ ODPOWIEDŹ:
- Odpowiadaj KRÓTKO (user jest zmęczony)
- Nie naciskaj na działanie
- Potwierdź: "Brzmi jakbyś potrzebował odpoczynku."
- Sprawdź podstawy: "Kiedy ostatnio jadłeś/spałeś?"
- Sugeruj minimalny wysiłek: "Może po prostu odpocznij?"
- Nie wywołuj poczucia winy o produktywność`,
    tone_hints: ["gentle", "brief", "accommodating", "patient"],
  }),

  mixed_signals: (e) => ({
    mode: "mixed_signals",
    instruction: `STAN EMOCJONALNY: Mieszane/sprzeczne emocje (wykryto ${e.secondary_emotions.length} silnych emocji)

DOSTOSUJ ODPOWIEDŹ:
- Uznaj złożoność: "To brzmi skomplikowanie."
- Nie zmuszaj do uproszczenia: "OK czuć wiele rzeczy naraz."
- Pomóż rozplątać: "Co teraz czujesz najmocniej?"
- Daj przestrzeń na ambiwalencję
- Cierpliwość, nie spiesz do rozwiązań`,
    tone_hints: ["patient", "accepting", "curious", "non-judgmental"],
  }),

  neutral: () => ({
    mode: "neutral",
    instruction: "",
    tone_hints: ["natural", "conversational"],
  }),
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Generate an emotion-adaptive prompt injection based on detected emotion.
 * Returns empty instruction for neutral mode (no adaptation needed).
 */
export function getAdaptivePrompt(emotion: EmotionState): AdaptivePrompt {
  const mode = determineResponseMode(emotion);
  return PROMPTS[mode](emotion);
}
