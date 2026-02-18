/**
 * BGML Quality Scoring & Response Selection
 *
 * Heuristic scoring for response quality + LLM-based selection.
 */

export interface ScoredResponse {
  text: string;
  score: number;
  breakdown: {
    length: number;
    structure: number;
    specificity: number;
    actionability: number;
  };
}

/**
 * Score a response using heuristics (0-100).
 */
export function scoreResponse(text: string): ScoredResponse {
  const length = scoreLengthQuality(text);
  const structure = scoreStructure(text);
  const specificity = scoreSpecificity(text);
  const actionability = scoreActionability(text);

  const score = Math.round(
    length * 0.15 + structure * 0.25 + specificity * 0.3 + actionability * 0.3,
  );

  return {
    text,
    score,
    breakdown: { length, structure, specificity, actionability },
  };
}

/**
 * Select the best response from a list using heuristic scoring.
 */
export function selectBest(responses: string[]): {
  best: string;
  scores: ScoredResponse[];
} {
  const scores = responses
    .filter((r) => r.length > 0)
    .map((r) => scoreResponse(r));

  scores.sort((a, b) => b.score - a.score);
  return { best: scores[0]?.text || "", scores };
}

// ── Scoring helpers ──

function scoreLengthQuality(text: string): number {
  const words = text.split(/\s+/).length;
  // Sweet spot: 100-500 words
  if (words < 20) return 10;
  if (words < 50) return 30;
  if (words < 100) return 60;
  if (words < 500) return 90;
  if (words < 1000) return 80;
  return 60; // Too verbose
}

function scoreStructure(text: string): number {
  let score = 40; // Base

  // Headers indicate structure
  const headers = (text.match(/^#{1,4}\s/gm) || []).length;
  if (headers > 0) score += 15;

  // Bullet points / numbered lists
  const lists = (text.match(/^[\s]*[-*•]\s|^\s*\d+\.\s/gm) || []).length;
  if (lists > 2) score += 15;

  // Paragraphs (double newlines)
  const paragraphs = text.split(/\n\n+/).length;
  if (paragraphs > 2) score += 10;

  // Bold / emphasis for key points
  const emphasis = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  if (emphasis > 0) score += 10;

  // Code blocks
  if (text.includes("```")) score += 10;

  return Math.min(score, 100);
}

function scoreSpecificity(text: string): number {
  let score = 30; // Base

  // Numbers / data points
  const numbers = (text.match(/\d+/g) || []).length;
  if (numbers > 3) score += 20;

  // Specific tools / technologies / names
  const properNouns = (text.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || [])
    .length;
  if (properNouns > 3) score += 15;

  // Examples
  const hasExamples =
    /\b(for example|e\.g\.|such as|like |instance|na przykład|np\.)/i.test(
      text,
    );
  if (hasExamples) score += 15;

  // Quotes / references
  if (text.includes('"') || text.includes("`")) score += 10;

  // URLs
  if (/https?:\/\//.test(text)) score += 10;

  return Math.min(score, 100);
}

function scoreActionability(text: string): number {
  let score = 20; // Base

  // Imperative verbs (action-oriented)
  const actions =
    /\b(implement|create|build|run|deploy|configure|install|set up|add|remove|update|change|fix|test|check|verify|use|apply|start|define)\b/gi;
  const actionCount = (text.match(actions) || []).length;
  if (actionCount > 3) score += 25;
  else if (actionCount > 0) score += 15;

  // Step-by-step instructions
  const steps = (text.match(/^\s*\d+\.\s/gm) || []).length;
  if (steps > 2) score += 20;

  // Code snippets (directly usable)
  const codeBlocks = (text.match(/```/g) || []).length / 2;
  if (codeBlocks > 0) score += 20;

  // Specific commands
  if (/\$\s|`[a-z]/i.test(text)) score += 15;

  return Math.min(score, 100);
}
