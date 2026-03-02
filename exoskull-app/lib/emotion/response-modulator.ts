/**
 * Emotion-Driven Response Modulator
 *
 * Adjusts the agent's system prompt tone based on detected user emotion.
 * Injected into the system prompt AFTER emotion analysis but BEFORE the LLM call.
 *
 * Flow: analyzeEmotion() → modulatePrompt() → system prompt injection
 */

import type { EmotionState, PrimaryEmotion } from "./types";

interface ModulationRule {
  conditions: (emotion: EmotionState) => boolean;
  instruction: string;
}

const MODULATION_RULES: ModulationRule[] = [
  {
    conditions: (e) =>
      e.primary_emotion === "fearful" || (e.valence < -0.3 && e.arousal > 0.5),
    instruction:
      "Użytkownik wykazuje niepokój/lęk. " +
      "Bądź spokojny i uspokajający. Używaj konkretnych kroków zamiast ogólnych porad. " +
      "Potwierdź że sytuacja jest do opanowania. Unikaj alarmu w języku. " +
      'Wzorzec: "Rozumiem że to stresujące. Zróbmy to krok po kroku..."',
  },
  {
    conditions: (e) =>
      e.primary_emotion === "angry" || (e.valence < -0.4 && e.dominance > 0.6),
    instruction:
      "Użytkownik jest sfrustrowany/zły. " +
      "Bądź bezpośredni — NIE lej wody. Przejdź od razu do rozwiązania. " +
      "Przeproś jeśli to wina systemu. Nie moralizuj, nie dawaj rad jak się uspokoić. " +
      'Wzorzec: "Masz rację że to frustrujące. Naprawiam to teraz..."',
  },
  {
    conditions: (e) =>
      e.primary_emotion === "sad" || (e.valence < -0.5 && e.arousal < 0.3),
    instruction:
      "Użytkownik wydaje się smutny/przygnębiony. " +
      "Bądź ciepły i empatyczny. Potwierdź uczucia (validation). " +
      "Nie próbuj od razu rozwiązywać — najpierw okaż zrozumienie. " +
      'Wzorzec: "Widzę że to ciężki moment. Jestem tutaj..."',
  },
  {
    conditions: (e) =>
      e.primary_emotion === "happy" || (e.valence > 0.5 && e.arousal > 0.4),
    instruction:
      "Użytkownik jest w dobrym nastroju/świętuje. " +
      "Dopasuj entuzjazm — pogratuluj, doceń sukces. " +
      "Zaproponuj rozwinięcie pozytywnego momentum. " +
      'Wzorzec: "Świetnie! Cieszę się razem z tobą..."',
  },
  {
    conditions: (e) => e.primary_emotion === "surprised" && e.valence < 0,
    instruction:
      "Użytkownik jest zaskoczony negatywnie. " +
      "Wyjaśnij sytuację spokojnie i jasno. Podaj kontekst. " +
      "Nie zakładaj że użytkownik wie dlaczego coś się wydarzyło.",
  },
  {
    conditions: (e) => e.arousal < 0.2 && e.valence < 0,
    instruction:
      "Użytkownik wykazuje niską energię/apatię. " +
      "Bądź delikatny ale konkretny. Proponuj JEDNĄ małą akcję zamiast wielu. " +
      "Nie przytłaczaj opcjami. Uprość komunikację.",
  },
];

/**
 * Generate a tone modulation instruction based on detected emotion.
 * Returns empty string for neutral emotions (no modulation needed).
 */
export function modulatePrompt(
  emotion: EmotionState,
  basePrompt: string,
): string {
  // Skip modulation for neutral or low-confidence states
  if (emotion.primary_emotion === "neutral" && emotion.intensity < 30) {
    return basePrompt;
  }

  if (emotion.confidence < 0.3) {
    return basePrompt;
  }

  // Find matching modulation rule
  const matchedRule = MODULATION_RULES.find((rule) => rule.conditions(emotion));

  if (!matchedRule) {
    return basePrompt;
  }

  const modulation =
    `\n\n## Emotion Modulation (confidence: ${emotion.confidence.toFixed(2)})\n` +
    `Detected: ${emotion.primary_emotion} (intensity: ${emotion.intensity}%, ` +
    `valence: ${emotion.valence.toFixed(2)}, arousal: ${emotion.arousal.toFixed(2)})\n` +
    matchedRule.instruction;

  return basePrompt + modulation;
}

/**
 * Get a short emotion label for logging/SSE.
 */
export function getEmotionLabel(emotion: EmotionState): string {
  const labels: Record<PrimaryEmotion, string> = {
    happy: "radosny",
    sad: "smutny",
    angry: "zirytowany",
    fearful: "niespokojny",
    disgusted: "zniesmaczony",
    surprised: "zaskoczony",
    neutral: "neutralny",
  };
  return labels[emotion.primary_emotion] || "neutralny";
}
