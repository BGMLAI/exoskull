/**
 * Request Parser - Detects explicit skill requests from conversation text
 *
 * Recognizes patterns like:
 * - "Chcę śledzić ile piję wody" → track water intake
 * - "Potrzebuję trackera do ćwiczeń" → exercise tracker
 * - "Przydałby się monitor wydatków" → spending monitor
 * - "I want to track my reading" → reading tracker
 */

import type { ParsedRequest, DetectionContext, SkillSuggestion } from "./types";

// =====================================================
// PATTERNS - Polish + English
// =====================================================

interface IntentPattern {
  regex: RegExp;
  intent: ParsedRequest["intent"];
  subjectGroup: number; // Which capture group contains the subject
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Polish - tracking
  {
    regex:
      /(?:chc[eę]|chcia[łl](?:a|e)?bym?)\s+(?:śledzić|trackować|monitorować|rejestrować|zapisywać|logować)\s+(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  {
    regex:
      /(?:potrzebuj[eę]|przydałby\s+(?:mi\s+)?się|fajnie\s+by\s+było\s+mieć)\s+(?:tracker(?:a)?|monitor(?:a)?|narzędzi[ea]?\s+do)\s+(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  {
    regex:
      /(?:zrób|stwórz|zbuduj|dodaj)\s+(?:mi\s+)?(?:tracker|monitor|skill|narzędzie)\s+(?:do\s+|dla\s+)?(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  {
    regex:
      /(?:chc[eę]|mógłbyś)\s+(?:mi\s+)?(?:śledzić|mierzyć|liczyć|notować)\s+(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  // Polish - reminders/automation
  {
    regex:
      /(?:przypomnij|przypominaj)\s+(?:mi\s+)?(?:o\s+|żeby\s+)?(.{3,80})/gi,
    intent: "remind",
    subjectGroup: 1,
  },
  {
    regex: /(?:zautomatyzuj|automatyzuj)\s+(.{3,80})/gi,
    intent: "automate",
    subjectGroup: 1,
  },
  // Polish - analysis
  {
    regex: /(?:analizuj|przeanalizuj|pokaż\s+statystyki)\s+(.{3,80})/gi,
    intent: "analyze",
    subjectGroup: 1,
  },
  // English - tracking
  {
    regex:
      /(?:i\s+)?(?:want|need|would\s+like)\s+to\s+(?:track|monitor|log|record)\s+(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  {
    regex:
      /(?:can\s+you|could\s+you|please)\s+(?:track|monitor|build|create)\s+(?:a\s+)?(?:tracker\s+for\s+)?(.{3,80})/gi,
    intent: "track",
    subjectGroup: 1,
  },
  {
    regex: /(?:build|create|make)\s+(?:me\s+)?(?:a\s+)?(.{3,60})\s+tracker/gi,
    intent: "track",
    subjectGroup: 1,
  },
  // English - reminders
  {
    regex:
      /(?:remind\s+me|set\s+(?:a\s+)?reminder)\s+(?:to\s+|about\s+)?(.{3,80})/gi,
    intent: "remind",
    subjectGroup: 1,
  },
  // English - automation
  {
    regex: /(?:automate|auto-?track)\s+(.{3,80})/gi,
    intent: "automate",
    subjectGroup: 1,
  },
];

// Subjects that map to known life areas
const SUBJECT_AREA_MAP: Record<string, string> = {
  // Health
  wod: "health",
  water: "health",
  sen: "health",
  sleep: "health",
  ćwicz: "health",
  exercise: "health",
  workout: "health",
  trening: "health",
  kalori: "health",
  calorie: "health",
  jedzeni: "health",
  food: "health",
  meal: "health",
  posiłk: "health",
  wag: "health",
  weight: "health",
  krok: "health",
  step: "health",
  bieg: "health",
  run: "health",
  // Productivity
  czas: "productivity",
  time: "productivity",
  task: "productivity",
  zadani: "productivity",
  focus: "productivity",
  produktywn: "productivity",
  // Finance
  wydatk: "finance",
  spending: "finance",
  pieniądz: "finance",
  money: "finance",
  budżet: "finance",
  budget: "finance",
  oszczędn: "finance",
  saving: "finance",
  // Mental
  nastrój: "mental",
  mood: "mental",
  stres: "mental",
  stress: "mental",
  medytacj: "mental",
  meditation: "mental",
  // Learning
  czytani: "learning",
  reading: "learning",
  książ: "learning",
  book: "learning",
  kurs: "learning",
  course: "learning",
  nauk: "learning",
  // Social
  kontakt: "social",
  social: "social",
  spotkani: "social",
  meeting: "social",
  // Creativity
  pisani: "creativity",
  writing: "creativity",
  rysowani: "creativity",
  drawing: "creativity",
  muzyk: "creativity",
  music: "creativity",
};

// =====================================================
// PARSER
// =====================================================

/**
 * Parse conversation transcript for explicit skill requests
 */
export function parseSkillRequests(
  transcript: string,
  context: DetectionContext,
): ParsedRequest[] {
  const requests: ParsedRequest[] = [];

  for (const pattern of INTENT_PATTERNS) {
    // Reset regex state
    pattern.regex.lastIndex = 0;

    let match;
    while ((match = pattern.regex.exec(transcript)) !== null) {
      const subject = cleanSubject(match[pattern.subjectGroup]);

      if (!subject || subject.length < 3) continue;

      // Skip if subject matches already installed mod
      if (isAlreadyCovered(subject, context)) continue;

      requests.push({
        intent: pattern.intent,
        subject,
        unit: extractUnit(subject),
        frequency: extractFrequency(transcript, match.index),
        confidence: calculateRequestConfidence(match[0], pattern.intent),
        raw_match: match[0].trim(),
      });
    }
  }

  // Deduplicate by subject similarity
  return deduplicateRequests(requests);
}

/**
 * Convert parsed requests to skill suggestions
 */
export function requestsToSuggestions(
  requests: ParsedRequest[],
  context: DetectionContext,
): SkillSuggestion[] {
  return requests.map((req) => ({
    tenant_id: context.tenant_id,
    source: "request_parse" as const,
    description: buildDescription(req),
    suggested_slug: buildSlug(req.subject),
    life_area: detectLifeArea(req.subject),
    confidence: req.confidence,
    reasoning: `User explicitly requested: "${req.raw_match}"`,
    conversation_id: context.conversation_id,
    status: "pending" as const,
  }));
}

// =====================================================
// HELPERS
// =====================================================

function cleanSubject(raw: string): string {
  return raw
    .trim()
    .replace(/[.!?,;:]+$/, "") // remove trailing punctuation
    .replace(/^(moje|moich|mój|my|the|a|an)\s+/i, "") // remove articles/possessives
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 60);
}

function extractUnit(subject: string): string | undefined {
  const unitPatterns = [
    /(?:w\s+)?(ml|litr(?:ach|ów|y)?|kg|kalori(?:ach|i)?|minut(?:ach|y)?|godzin(?:ach|y)?|krok(?:ach|ów|i)?)/i,
    /(?:in\s+)?(ml|liters?|kg|calories?|minutes?|hours?|steps?)/i,
  ];

  for (const pattern of unitPatterns) {
    const match = subject.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractFrequency(
  transcript: string,
  matchIndex: number,
): string | undefined {
  // Look at surrounding context (100 chars before and after)
  const context = transcript.slice(
    Math.max(0, matchIndex - 100),
    matchIndex + 200,
  );

  if (/codzienni|every\s*day|daily|dziennie/i.test(context)) return "daily";
  if (/tygodni|weekly|co\s+tydzień/i.test(context)) return "weekly";
  if (/miesięczni|monthly|co\s+miesiąc/i.test(context)) return "monthly";
  return undefined;
}

function calculateRequestConfidence(
  matchText: string,
  intent: ParsedRequest["intent"],
): number {
  let confidence = 0.7; // Base for any match

  // Explicit "I want to track" = high confidence
  if (intent === "track") confidence += 0.15;
  if (intent === "automate") confidence += 0.1;

  // Longer, more specific matches = higher confidence
  if (matchText.length > 30) confidence += 0.05;
  if (matchText.length > 50) confidence += 0.05;

  return Math.min(confidence, 0.95);
}

function isAlreadyCovered(subject: string, context: DetectionContext): boolean {
  const subjectLower = subject.toLowerCase();
  const allSlugs = [...context.installed_mods, ...context.existing_skills];

  for (const slug of allSlugs) {
    const slugWords = slug.replace(/[-_]/g, " ").toLowerCase();
    // Check if subject keywords overlap with existing slug
    const subjectWords = subjectLower.split(/\s+/);
    const matchingWords = subjectWords.filter(
      (w) => w.length > 3 && slugWords.includes(w),
    );
    if (matchingWords.length > 0) return true;
  }
  return false;
}

function detectLifeArea(subject: string): string | undefined {
  const subjectLower = subject.toLowerCase();

  for (const [keyword, area] of Object.entries(SUBJECT_AREA_MAP)) {
    if (subjectLower.includes(keyword)) return area;
  }
  return undefined;
}

function buildDescription(req: ParsedRequest): string {
  const intentMap: Record<ParsedRequest["intent"], string> = {
    track: "Track",
    monitor: "Monitor",
    automate: "Automate",
    remind: "Set reminders for",
    analyze: "Analyze",
  };
  const prefix = intentMap[req.intent] || "Track";
  const unit = req.unit ? ` (${req.unit})` : "";
  const freq = req.frequency ? `, ${req.frequency}` : "";
  return `${prefix} ${req.subject}${unit}${freq}`;
}

function buildSlug(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  return `custom-${slug}`;
}

function deduplicateRequests(requests: ParsedRequest[]): ParsedRequest[] {
  const seen = new Set<string>();
  return requests.filter((req) => {
    const key = req.subject.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
