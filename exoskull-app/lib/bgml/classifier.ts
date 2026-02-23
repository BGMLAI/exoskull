/**
 * BGML Domain Classifier + Complexity Detector
 *
 * Port from BGML.ai Python router/classifier.py → TypeScript.
 * Keyword-based classification with domain and complexity scoring.
 */

export type BGMLDomain =
  | "business"
  | "engineering"
  | "science"
  | "general"
  | "personal"
  | "creative";

export interface ClassificationResult {
  domain: BGMLDomain;
  complexity: number; // 1-5
  confidence: number; // 0-1
  keywords: string[];
}

const DOMAIN_KEYWORDS: Record<BGMLDomain, string[]> = {
  business: [
    // English
    "revenue",
    "profit",
    "market",
    "competitor",
    "strategy",
    "investor",
    "startup",
    "saas",
    "pricing",
    "churn",
    "acquisition",
    "retention",
    "funnel",
    "growth",
    "roi",
    "kpi",
    "swot",
    "porter",
    "business model",
    "go-to-market",
    "unit economics",
    "valuation",
    "series a",
    "pitch deck",
    "burn rate",
    "cap table",
    // Polish
    "przychod",
    "zysk",
    "rynek",
    "konkurencj",
    "strategia",
    "strategię",
    "inwestor",
    "cenow",
    "cena",
    "klient",
    "sprzedaż",
    "sprzedaz",
    "marketing",
    "biznes",
    "firma",
    "model biznesowy",
    "wzrost",
    "rentownoś",
    "marża",
    "marza",
    "skalowani",
    "monetyzacj",
    "subskrypcj",
    "konwersj",
    "budżet",
    "budzet",
  ],
  engineering: [
    // English
    "architecture",
    "api",
    "database",
    "deploy",
    "microservice",
    "monolith",
    "latency",
    "throughput",
    "cache",
    "scale",
    "debug",
    "bug",
    "error",
    "performance",
    "optimization",
    "refactor",
    "migration",
    "ci/cd",
    "docker",
    "kubernetes",
    "infrastructure",
    "load balancer",
    "queue",
    "bottleneck",
    "code",
    "test",
    "endpoint",
    "typescript",
    "javascript",
    "react",
    "nextjs",
    "supabase",
    "postgres",
    // Polish
    "architektur",
    "baza danych",
    "wdroż",
    "wdroz",
    "serwer",
    "backend",
    "frontend",
    "optymalizacj",
    "refaktor",
    "migracj",
    "infrastruktur",
    "kod",
    "napisz",
    "napraw",
    "zbuduj",
    "programowan",
    "testow",
    "unitowy",
    "integracyj",
    "deploymen",
  ],
  science: [
    // English
    "hypothesis",
    "experiment",
    "data",
    "correlation",
    "causation",
    "variable",
    "control group",
    "statistical",
    "p-value",
    "significance",
    "sample size",
    "methodology",
    "peer review",
    "research",
    "empirical",
    "observation",
    // Polish
    "hipotez",
    "eksperyment",
    "korelacj",
    "statystycz",
    "metodologi",
    "badani",
    "obserwacj",
    "nauko",
    "naukow",
  ],
  personal: [
    // English
    "anxiety",
    "stress",
    "relationship",
    "therapy",
    "emotion",
    "feeling",
    "trauma",
    "depression",
    "motivation",
    "habit",
    "sleep",
    "health",
    "meditation",
    "mindfulness",
    "self-care",
    "burnout",
    "work-life balance",
    // Polish
    "lęk",
    "stres",
    "relacj",
    "terapia",
    "emocj",
    "uczuci",
    "trauma",
    "depresj",
    "motywacj",
    "nawyk",
    "sen",
    "spanie",
    "zdrowi",
    "medytacj",
    "wypaleni",
    "prokrastynacj",
    "energia",
    "samopoczuci",
    "zadanie",
    "zadania",
    "cel",
    "cele",
    "dentysta",
    "lekarz",
    "doktor",
    "zadzwoni",
    "spotkani",
  ],
  creative: [
    // English
    "design",
    "brand",
    "story",
    "narrative",
    "content",
    "creative",
    "aesthetic",
    "visual",
    "copywriting",
    "campaign",
    "inspiration",
    "art",
    "music",
    "film",
    "writing",
    "poetry",
    // Polish
    "projekt",
    "marka",
    "historia",
    "narracja",
    "treść",
    "tresc",
    "kreatywn",
    "wizualn",
    "kampania",
    "inspiracj",
    "sztuka",
    "muzyka",
    "pisani",
    "grafik",
  ],
  general: [
    // English
    "how",
    "why",
    "what",
    "explain",
    "compare",
    "difference",
    "should",
    "best",
    "recommend",
    "opinion",
    "think",
    "decide",
    // Polish
    "jak",
    "dlaczego",
    "co ",
    "wyjaśnij",
    "wyjasni",
    "porównaj",
    "porownaj",
    "różnica",
    "roznica",
    "najlep",
    "polec",
    "opinia",
    "myśl",
    "mysl",
    "zdecyduj",
    "cześć",
    "czesc",
    "hej",
    "siema",
  ],
};

const COMPLEXITY_INDICATORS: Record<number, string[]> = {
  5: [
    // English
    "optimize across multiple",
    "trade-off",
    "tradeoff",
    "multi-dimensional",
    "conflicting requirements",
    "systemic",
    "root cause analysis",
    "strategic implications",
    "long-term consequences",
    "paradigm shift",
    // Polish
    "5-letni",
    "wieloletni",
    "systemow",
    "długoterminow",
    "dlugoterminow",
    "strategię wejścia",
    "strategie wejscia",
    "zmienić model biznesowy",
    "zmienic model biznesowy",
    "kompleksow",
    "fundamentaln",
    "przeanalizuj cał",
    "przeanalizuj cal",
  ],
  4: [
    // English
    "analyze",
    "evaluate",
    "compare multiple",
    "pros and cons",
    "risk assessment",
    "deep dive",
    "implications",
    "second-order effects",
    "architecture decision",
    // Polish
    "przeanalizuj",
    "oceń",
    "ocen",
    "porównaj kilka",
    "porownaj kilka",
    "za i przeciw",
    "ryzyko",
    "dogłębn",
    "doglebna",
    "implikacj",
    "zaprojektuj",
    "zaplanuj strategi",
  ],
  3: [
    // English
    "plan",
    "strategy",
    "approach",
    "implementation",
    "how should",
    "what approach",
    "best practice",
    "recommend",
    "framework",
    // Polish
    "zaplanuj",
    "strategia",
    "podejście",
    "podejscie",
    "implementacj",
    "jak powinn",
    "najlepsz",
    "polecasz",
    "framework",
    "jaką",
    "jaka",
    "radzić",
    "radzic",
    "sobie z",
  ],
  2: [
    // English
    "how to",
    "steps to",
    "guide",
    "tutorial",
    "example",
    "explain",
    "what is",
    "definition",
    // Polish
    "jak zrobić",
    "jak zrobic",
    "kroki",
    "poradnik",
    "przykład",
    "przyklad",
    "wyjaśnij",
    "wyjasni",
    "co to jest",
    "definicj",
    "napisz",
    "zbuduj",
    "napraw",
  ],
  1: [
    // English
    "simple",
    "quick",
    "basic",
    "just",
    "only",
    "single",
    "one thing",
    "yes or no",
    // Polish
    "prosty",
    "szybko",
    "podstawow",
    "tylko",
    "jeden",
    "tak lub nie",
    "dodaj",
    "pokaż",
    "pokaz",
    "wyślij",
    "wyslij",
    "cześć",
    "hej",
  ],
};

/**
 * Detect domain from user message using keyword matching.
 */
export function detectDomain(text: string): {
  domain: BGMLDomain;
  confidence: number;
  keywords: string[];
} {
  const lower = text.toLowerCase();
  const scores: Record<BGMLDomain, { score: number; matched: string[] }> = {
    business: { score: 0, matched: [] },
    engineering: { score: 0, matched: [] },
    science: { score: 0, matched: [] },
    personal: { score: 0, matched: [] },
    creative: { score: 0, matched: [] },
    general: { score: 0, matched: [] },
  };

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[domain as BGMLDomain].score++;
        scores[domain as BGMLDomain].matched.push(kw);
      }
    }
  }

  // Find top domain (exclude "general" unless it's the only match)
  let best: BGMLDomain = "general";
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const [domain, { score, matched }] of Object.entries(scores)) {
    if (domain === "general") continue;
    if (score > bestScore) {
      bestScore = score;
      best = domain as BGMLDomain;
      bestMatched = matched;
    }
  }

  // Fallback to general if no strong domain match
  if (bestScore === 0) {
    best = "general";
    bestMatched = scores.general.matched;
    bestScore = scores.general.score;
  }

  const totalKeywords = Object.values(DOMAIN_KEYWORDS).flat().length;
  const confidence = Math.min(bestScore / 5, 1);

  return { domain: best, confidence, keywords: bestMatched };
}

/**
 * Classify complexity of a query (1-5 scale).
 */
export function classifyComplexity(text: string): number {
  const lower = text.toLowerCase();

  // Check from high to low complexity
  for (const level of [5, 4, 3, 2, 1]) {
    const indicators = COMPLEXITY_INDICATORS[level];
    for (const indicator of indicators) {
      if (lower.includes(indicator)) return level;
    }
  }

  // Heuristic: longer messages tend to be more complex
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 100) return 4;
  if (wordCount > 50) return 3;
  if (wordCount > 20) return 2;
  return 1;
}

/**
 * Full classification: domain + complexity.
 */
export function classify(text: string): ClassificationResult {
  const { domain, confidence, keywords } = detectDomain(text);
  const complexity = classifyComplexity(text);
  return { domain, complexity, confidence, keywords };
}
