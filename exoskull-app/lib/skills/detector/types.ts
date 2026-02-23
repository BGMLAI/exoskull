// =====================================================
// SKILL NEED DETECTOR - Types
// =====================================================

export type DetectionSource =
  | "request_parse"
  | "pattern_match"
  | "gap_detection"
  | "goal_driven";

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "generated"
  | "expired";

export interface SkillSuggestion {
  id?: string;
  tenant_id: string;
  source: DetectionSource;
  description: string;
  suggested_slug?: string;
  life_area?: string;
  confidence: number; // 0.00-1.00
  reasoning: string;
  conversation_id?: string;
  status: SuggestionStatus;
  generated_skill_id?: string;
  created_at?: string;
}

export interface DetectionContext {
  tenant_id: string;
  transcript: string;
  conversation_id?: string;
  installed_mods: string[]; // slugs of currently installed mods
  existing_skills: string[]; // slugs of generated skills (approved or pending)
  recent_suggestions: string[]; // descriptions of recent suggestions (to avoid duplicates)
  highlights?: Array<{ category: string; content: string }>;
}

export interface DetectionResult {
  suggestions: SkillSuggestion[];
  stats: {
    request_parsed: number;
    patterns_matched: number;
    gaps_bridged: number;
    duplicates_filtered: number;
  };
}

// Request Parser types
export interface ParsedRequest {
  intent: "track" | "monitor" | "automate" | "remind" | "analyze";
  subject: string;
  unit?: string;
  frequency?: string;
  confidence: number;
  raw_match: string;
}

// Pattern Matcher types
export interface TopicFrequency {
  topic: string;
  count: number;
  days_span: number;
  related_area?: string;
  sample_mentions: string[];
}

export interface PatternSkillGap {
  topic: string;
  frequency: TopicFrequency;
  missing_mod: string; // What mod/skill would cover this
  confidence: number;
  reasoning: string;
}

// Gap Bridge types
export interface GapSkillMapping {
  area_slug: string;
  severity: "moderate" | "severe";
  suggested_skills: Array<{
    slug: string;
    description: string;
    priority: number;
  }>;
}
