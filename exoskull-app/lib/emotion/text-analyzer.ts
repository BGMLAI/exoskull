/**
 * Text Emotion Analyzer
 *
 * Uses HuggingFace Inference API (free) for emotion detection from text.
 * Model: j-hartmann/emotion-english-distilroberta-base (28 emotions)
 *
 * Falls back to simple keyword matching for Polish text.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionScore {
  label: string
  score: number
}

export interface EmotionAnalysis {
  mood: 'positive' | 'calm' | 'stressed' | 'low' | 'focused'
  confidence: number
  emotions: EmotionScore[]
  source: 'text_hf' | 'text_keywords'
}

// ============================================================================
// MOOD MAPPING
// ============================================================================

const EMOTION_TO_MOOD: Record<string, 'positive' | 'calm' | 'stressed' | 'low' | 'focused'> = {
  joy: 'positive',
  love: 'positive',
  surprise: 'positive',
  optimism: 'positive',
  amusement: 'positive',
  excitement: 'positive',
  gratitude: 'positive',
  pride: 'positive',

  neutral: 'calm',
  approval: 'calm',
  realization: 'calm',
  curiosity: 'focused',
  desire: 'focused',
  admiration: 'focused',

  anger: 'stressed',
  annoyance: 'stressed',
  nervousness: 'stressed',
  fear: 'stressed',
  disgust: 'stressed',
  confusion: 'stressed',
  disapproval: 'stressed',
  embarrassment: 'stressed',

  sadness: 'low',
  grief: 'low',
  disappointment: 'low',
  remorse: 'low',
  caring: 'calm',
}

// ============================================================================
// POLISH KEYWORD FALLBACK
// ============================================================================

const PL_MOOD_KEYWORDS: Record<string, string[]> = {
  positive: ['super', 'świetnie', 'fajnie', 'dobry', 'udany', 'cieszę', 'radość', 'szczęśliwy', 'ekstra', 'bomba', 'git'],
  stressed: ['stres', 'nerwowy', 'zdenerwowany', 'złość', 'wkurz', 'ciśnienie', 'za dużo', 'nie wyrabiam', 'deadline', 'pilne'],
  low: ['zmęczony', 'smutny', 'kiepsko', 'źle', 'depresja', 'nie chce mi się', 'beznadziejnie', 'trudno', 'ciężko'],
  focused: ['pracuję', 'skupiam', 'produktywny', 'flow', 'w trybie', 'robię', 'tworzę'],
}

function analyzeByKeywords(text: string): EmotionAnalysis {
  const lower = text.toLowerCase()

  for (const [mood, keywords] of Object.entries(PL_MOOD_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return {
          mood: mood as EmotionAnalysis['mood'],
          confidence: 0.6,
          emotions: [{ label: mood, score: 0.6 }],
          source: 'text_keywords'
        }
      }
    }
  }

  return {
    mood: 'calm',
    confidence: 0.3,
    emotions: [{ label: 'neutral', score: 0.3 }],
    source: 'text_keywords'
  }
}

// ============================================================================
// HUGGINGFACE ANALYSIS
// ============================================================================

const HF_API_URL = 'https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base'

export async function analyzeTextEmotion(text: string): Promise<EmotionAnalysis> {
  const hfToken = process.env.HUGGINGFACE_API_KEY

  // If no HF token or short text, use keyword fallback
  if (!hfToken || text.length < 5) {
    return analyzeByKeywords(text)
  }

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: text })
    })

    if (!response.ok) {
      console.warn('[EmotionAnalyzer] HF API error, falling back to keywords')
      return analyzeByKeywords(text)
    }

    const results = await response.json()

    // HF returns [[{label, score}, ...]]
    const emotions: EmotionScore[] = Array.isArray(results[0])
      ? results[0]
      : results

    if (!emotions || emotions.length === 0) {
      return analyzeByKeywords(text)
    }

    // Sort by score
    emotions.sort((a, b) => b.score - a.score)

    // Map top emotion to mood
    const topEmotion = emotions[0]
    const mood = EMOTION_TO_MOOD[topEmotion.label] || 'calm'

    return {
      mood,
      confidence: topEmotion.score,
      emotions: emotions.slice(0, 5),
      source: 'text_hf'
    }
  } catch (error) {
    console.error('[EmotionAnalyzer] Error:', error)
    return analyzeByKeywords(text)
  }
}
