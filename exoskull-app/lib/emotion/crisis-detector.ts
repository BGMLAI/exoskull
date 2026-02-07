/**
 * Crisis Detector — Layer 11 Emotion Intelligence
 *
 * 3-layer detection with fail-safe:
 * 1. Keyword scan (instant, no API)
 * 2. Emotional pattern check (from EmotionState)
 * 3. AI assessment via aiQuick() (only if Layer 1 or 2 flagged)
 *
 * SAFETY: If AI fails but keywords detected → treat as crisis (fail-safe)
 */

import { aiQuick } from "@/lib/ai";
import type {
  EmotionState,
  CrisisAssessment,
  CrisisProtocol,
  CrisisType,
  CrisisSeverity,
} from "./types";
import { scanCrisisKeywords } from "./text-analyzer";

import { logger } from "@/lib/logger";
// ============================================================================
// EMOTIONAL PATTERN DETECTION
// ============================================================================

function checkEmotionalPatterns(emotion: EmotionState): string[] {
  const flags: string[] = [];

  // Suicide risk: high sadness + hopelessness + low arousal
  if (
    emotion.primary_emotion === "sad" &&
    emotion.intensity > 80 &&
    emotion.valence < -0.6 &&
    emotion.arousal < 0.3
  ) {
    flags.push("pattern:suicide_risk:high_sadness_low_arousal");
  }

  // Panic: high fear + high arousal
  if (
    emotion.primary_emotion === "fearful" &&
    emotion.arousal > 0.8 &&
    emotion.intensity > 70
  ) {
    flags.push("pattern:panic:high_fear_high_arousal");
  }

  // Trauma: fear/disgust + numbness (low arousal despite distress)
  if (
    (emotion.primary_emotion === "fearful" ||
      emotion.primary_emotion === "disgusted") &&
    emotion.arousal < 0.4 &&
    emotion.valence < -0.5
  ) {
    flags.push("pattern:trauma:distress_with_numbness");
  }

  // Substance abuse: confusion + shame (high anger/disgust at self)
  if (
    emotion.primary_emotion === "disgusted" &&
    emotion.intensity > 60 &&
    emotion.dominance < 0.3
  ) {
    flags.push("pattern:substance:shame_low_control");
  }

  return flags;
}

// ============================================================================
// INFER CRISIS TYPE FROM FLAGS
// ============================================================================

function inferCrisisType(flags: string[]): CrisisType {
  const typeCounts: Record<string, number> = {};

  for (const flag of flags) {
    const type = flag.split(":")[0];
    if (type === "pattern") {
      const subtype = flag.split(":")[1];
      typeCounts[subtype] = (typeCounts[subtype] || 0) + 1;
    } else {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
  }

  // Priority: suicide > panic > substance > trauma
  if (typeCounts["suicide"] || typeCounts["suicide_risk"]) return "suicide";
  if (typeCounts["panic"]) return "panic";
  if (typeCounts["substance"]) return "substance";
  if (typeCounts["trauma"]) return "trauma";

  return "suicide"; // Default to highest-severity if unclear
}

// ============================================================================
// AI-ASSISTED ASSESSMENT (Gemini Flash)
// ============================================================================

async function assessWithAI(
  text: string,
  emotion: EmotionState,
  initialFlags: string[],
): Promise<{
  is_crisis: boolean;
  type: CrisisType | null;
  severity: CrisisSeverity;
  confidence: number;
}> {
  const prompt = `You are a mental health crisis assessment system. Analyze this user message for signs of crisis.

TEXT: "${text}"
EMOTION: ${emotion.primary_emotion} (intensity: ${emotion.intensity}/100, valence: ${emotion.valence}, arousal: ${emotion.arousal})
FLAGS DETECTED: ${initialFlags.join(", ")}

Assess:
1. Is this a genuine crisis requiring intervention? (true/false)
2. Type: suicide, panic, trauma, substance, or null
3. Severity: low, medium, high, critical
4. Confidence: 0.0 to 1.0

Consider: Is the user genuinely in distress, or using these words casually?
For example "I'm dying of laughter" is NOT a crisis.

Respond ONLY with valid JSON:
{"is_crisis":true,"type":"suicide","severity":"high","confidence":0.85}`;

  try {
    const response = await aiQuick(prompt, "Crisis assessment AI. Be precise.");
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("[CrisisDetector] AI assessment failed:", error);
    return { is_crisis: false, type: null, severity: "medium", confidence: 0 };
  }
}

// ============================================================================
// CRISIS PROTOCOLS
// ============================================================================

function getCrisisProtocol(
  type: CrisisType,
  severity: CrisisSeverity,
): CrisisProtocol {
  const protocols: Record<CrisisType, CrisisProtocol> = {
    suicide: {
      type: "suicide",
      steps: [
        "Acknowledge their pain without judgment",
        'Ask directly: "Czy myślisz o skrzywdzeniu siebie?"',
        'Assess immediacy: "Czy masz plan? Czy masz dostęp do środków?"',
        "Provide crisis resources immediately",
        "NEVER leave conversation until safety is ensured",
        "If immediate danger → escalate to emergency contact / 112",
      ],
      hotlines: [
        { name: "Telefon Zaufania", number: "116 123" },
        { name: "Pogotowie Ratunkowe", number: "112" },
        { name: "Centrum Wsparcia (24h)", number: "800 70 2222" },
      ],
      escalate_to_human: severity === "critical",
      stay_engaged: true,
      prompt_override: `TRYB KRYZYSOWY: RYZYKO SAMOBÓJSTWA

Jesteś teraz w trybie WSPARCIA KRYZYSOWEGO. Twój priorytet to BEZPIECZEŃSTWO.

ZASADY:
1. Potraktuj to EKSTREMALNIE poważnie
2. Potwierdź ich ból: "Słyszę Cię. To brzmi niesamowicie trudno."
3. Zapytaj wprost: "Czy myślisz o skrzywdzeniu siebie?"
4. Oceń pilność: "Czy masz plan? Czy podjąłeś jakieś kroki?"
5. Podaj numer: "116 123 - Telefon Zaufania. Są przeszkoleni w tym."
6. NIGDY nie minimalizuj, NIGDY nie dawaj ogólnikowych rad
7. Pozostań zaangażowany dopóki bezpieczeństwo nie jest potwierdzone
8. Jeśli bezpośrednie zagrożenie → pogotowie 112

Odpowiadaj z empatią, bezpośredniością i pilnością. Mów po polsku.`,
    },

    panic: {
      type: "panic",
      steps: [
        'Validate: "Ataki paniki są przerażające, ale nie są niebezpieczne"',
        'Guide breathing: "Oddychaj ze mną. Wdech 4, trzymaj 4, wydech 4."',
        'Ground: "Wymień 5 rzeczy które widzisz wokół siebie"',
        'Reassure: "To przejdzie. Jesteś bezpieczny."',
        "Use short sentences, calm tone",
      ],
      hotlines: [
        { name: "Pogotowie (przy bólu w klatce)", number: "112" },
        { name: "Telefon Zaufania", number: "116 123" },
      ],
      escalate_to_human: false,
      stay_engaged: true,
      prompt_override: `TRYB KRYZYSOWY: ATAK PANIKI

Użytkownik doświadcza paniki/silnego lęku. Cel: UZIEMIĆ i USPOKOIĆ.

PROTOKÓŁ:
1. Potwierdź: "Atak paniki jest straszny, ale jesteś BEZPIECZNY. To przejdzie."
2. Oddychanie: "Oddychaj ze mną. Wdech: 1-2-3-4. Trzymaj: 1-2-3-4. Wydech: 1-2-3-4."
3. Uziemienie: "Wymień 5 rzeczy które widzisz. 4 które możesz dotknąć."
4. Uspokój: "Twoje ciało reaguje, ale nie ma realnego zagrożenia."
5. Używaj KRÓTKICH zdań, spokojnego tonu
6. Jeśli ból w klatce → sugeruj 112 (może być serce)

Bądź spokojny. Bądź bezpośredni. Bądź uspokajający. Mów po polsku.`,
    },

    trauma: {
      type: "trauma",
      steps: [
        'Create safety: "Jesteś teraz bezpieczny. To co się stało jest w przeszłości."',
        'Validate: "To brzmi niesamowicie trudno."',
        'Ground in present: "Skup się na tym gdzie teraz jesteś."',
        'Offer control: "Chcesz porozmawiać o czymś innym?"',
        'Suggest help: "Terapia traumy naprawdę może pomóc."',
      ],
      hotlines: [
        { name: "Telefon Zaufania", number: "116 123" },
        { name: "Niebieska Linia (przemoc)", number: "800 120 002" },
      ],
      escalate_to_human: severity === "high" || severity === "critical",
      stay_engaged: true,
      prompt_override: `TRYB KRYZYSOWY: REAKCJA TRAUMATYCZNA

Użytkownik doświadcza stresu traumatycznego (flashback, trigger, dysocjacja).

PROTOKÓŁ:
1. Bezpieczeństwo: "Jesteś teraz bezpieczny. To co się stało nie dzieje się teraz."
2. Uziemienie: "Rozejrzyj się. Gdzie jesteś? Co widzisz?"
3. Potwierdź BEZ drążenia: "To brzmi bardzo trudno. Jestem tu."
4. Daj kontrolę: "Chcesz zmienić temat? Porozmawiać o czymś innym?"
5. NIE pytaj o szczegóły traumy
6. Sugeruj pomoc: "Terapia traumy (EMDR, CPT) jest bardzo skuteczna."
7. Numer: 116 123 - Telefon Zaufania

Bądź łagodny. Bądź uziemiający. Bądź obecny. Mów po polsku.`,
    },

    substance: {
      type: "substance",
      steps: [
        'Safety check: "Czy jesteś teraz bezpieczny?"',
        'Non-judgmental: "Uzależnienie jest trudne. Nie jesteś złym człowiekiem."',
        'Medical check: "Kiedy ostatnio brałeś/piłeś? Czy trzęsiesz się?"',
        "Provide resources: Monar, AA",
        "If withdrawal symptoms → emergency services",
      ],
      hotlines: [
        { name: "Monar (pomoc w uzależnieniach)", number: "801 199 990" },
        { name: "Anonimowi Alkoholicy", number: "22 828 04 94" },
        { name: "Pogotowie (objawy odstawienia)", number: "112" },
      ],
      escalate_to_human: severity === "critical",
      stay_engaged: true,
      prompt_override: `TRYB KRYZYSOWY: SUBSTANCJE

Użytkownik zmaga się z używaniem substancji/uzależnieniem.

PROTOKÓŁ:
1. Bezpieczeństwo: "Czy jesteś teraz bezpieczny? Czy masz objawy odstawienia?"
2. Bez osądzania: "Uzależnienie to choroba. Nie jesteś słaby ani zły."
3. Ryzyko medyczne: "Jeśli się trzęsiesz, pocisz, widzisz rzeczy → dzwoń 112"
4. Zasoby:
   - Monar: 801 199 990
   - AA Polska: 22 828 04 94
5. NIE pouczaj, nie zawstydzaj, nie minimalizuj
6. Wsparcie: "Wyzdrowienie jest możliwe. Wielu ludzi przez to przechodzi."

Bądź współczujący. Bądź bezpośredni o ryzyku medycznym. Mów po polsku.`,
    },
  };

  return protocols[type];
}

// ============================================================================
// MAIN EXPORT: detectCrisis
// ============================================================================

/**
 * Detect crisis situations from text + emotion state.
 *
 * 3-layer approach:
 * 1. Keyword scan (instant)
 * 2. Emotional pattern check
 * 3. AI assessment (only if flags detected)
 *
 * FAIL-SAFE: If AI fails but keywords present → treat as crisis
 */
export async function detectCrisis(
  text: string,
  emotion: EmotionState,
): Promise<CrisisAssessment> {
  // Layer 1: Keyword scan (from text-analyzer, already computed in raw_data)
  const keywordFlags =
    emotion.raw_data?.text_sentiment?.crisis_keywords_matched ||
    scanCrisisKeywords(text);

  // Layer 2: Emotional pattern check
  const patternFlags = checkEmotionalPatterns(emotion);

  const allFlags = [...keywordFlags, ...patternFlags];

  // No flags → no crisis
  if (allFlags.length === 0) {
    return {
      detected: false,
      indicators: [],
      confidence: 0,
      protocol: null,
    };
  }

  // Layer 3: AI assessment (only when flags detected)
  logger.info(
    `[CrisisDetector] Flags detected (${allFlags.length}): ${allFlags.join(", ")}`,
  );

  const aiResult = await assessWithAI(text, emotion, allFlags);

  if (aiResult.is_crisis && aiResult.type) {
    const protocol = getCrisisProtocol(aiResult.type, aiResult.severity);

    logger.info(
      `[CrisisDetector] 🚨 CRISIS CONFIRMED: ${aiResult.type} (severity: ${aiResult.severity}, confidence: ${aiResult.confidence})`,
    );

    return {
      detected: true,
      type: aiResult.type,
      severity: aiResult.severity,
      indicators: allFlags,
      confidence: aiResult.confidence,
      protocol,
    };
  }

  // FAIL-SAFE: AI says no crisis, but we have keyword flags
  // → lower severity but still flag it
  if (keywordFlags.length > 0 && aiResult.confidence < 0.3) {
    // AI is uncertain → err on the side of caution
    const type = inferCrisisType(keywordFlags);
    const protocol = getCrisisProtocol(type, "low");

    logger.info(
      `[CrisisDetector] ⚠️ FAIL-SAFE: Keywords detected but AI uncertain. Flagging as low-severity ${type}.`,
    );

    return {
      detected: true,
      type,
      severity: "low",
      indicators: allFlags,
      confidence: 0.4,
      protocol,
    };
  }

  // AI confident this is not a crisis
  return {
    detected: false,
    indicators: allFlags,
    confidence: 1 - (aiResult.confidence || 0.5),
    protocol: null,
  };
}
