/**
 * IORS Core Types
 *
 * All TypeScript interfaces for the IORS system:
 * personality, emotions (Tau matrix), autonomy, leads, emergency contacts, birth flow.
 */

// ============================================================================
// PERSONALITY
// ============================================================================

export interface IORSPersonality {
  name: string;
  voice_id: string | null;
  language: "pl" | "en" | "auto";
  style: {
    formality: number; // 0-100 (casual → formal)
    humor: number; // 0-100 (serious → funny)
    directness: number; // 0-100 (gentle → blunt)
    empathy: number; // 0-100 (factual → emotional)
    detail_level: number; // 0-100 (brief → verbose)
  };
  proactivity: number; // 0-100 (passive → autonomous)
  communication_hours: {
    start: string; // "HH:MM"
    end: string; // "HH:MM"
  };
}

export const DEFAULT_PERSONALITY: IORSPersonality = {
  name: "IORS",
  voice_id: null,
  language: "auto",
  style: {
    formality: 30,
    humor: 40,
    directness: 70,
    empathy: 60,
    detail_level: 40,
  },
  proactivity: 50,
  communication_hours: { start: "07:00", end: "23:00" },
};

// ============================================================================
// EMOTION (TAU MATRIX)
// ============================================================================

/**
 * Tau Matrix — 4-quadrant emotion classification.
 *
 * (znane/nieznane) × (chce/nie chce) + stopien podkrytycznosci.
 *
 * known_want:   Radosc, satysfakcja, pozadanie
 * known_unwant: Zlosc, frustracja, niechec
 * unknown_want: Ciekawosc, nadzieja, ekscytacja
 * unknown_unwant: Lek, niepokoj, niepewnosc
 */
export type TauQuadrant =
  | "known_want"
  | "known_unwant"
  | "unknown_want"
  | "unknown_unwant";

export interface EmotionSignal {
  quadrant: TauQuadrant;
  subcriticality: number; // 0-1 (0=spokojna, 1=zywiolowa)
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  label: string; // 'anxious', 'excited', 'angry', etc.
  confidence: number; // 0 to 1
  source: "text" | "voice" | "fusion" | "wearable";
  context?: Record<string, unknown>;
}

// ============================================================================
// AUTONOMY PERMISSIONS
// ============================================================================

export type AutonomyActionType =
  | "log"
  | "message"
  | "schedule"
  | "call"
  | "create_mod"
  | "purchase"
  | "cancel"
  | "share_data";

export type AutonomyDomain =
  | "health"
  | "finance"
  | "work"
  | "social"
  | "home"
  | "business"
  | "*";

export interface AutonomyPermission {
  id: string;
  tenant_id: string;
  action_type: AutonomyActionType;
  domain: AutonomyDomain;
  granted: boolean;
  threshold_amount?: number;
  threshold_frequency?: number;
  requires_confirmation: boolean;
  granted_at?: string;
  revoked_at?: string;
  granted_via: "manual" | "conversation" | "settings" | "birth";
  uses_count: number;
  last_used_at?: string;
}

export interface PermissionCheckResult {
  permitted: boolean;
  requires_confirmation: boolean;
  permission?: AutonomyPermission;
}

// ============================================================================
// LEAD MANAGEMENT
// ============================================================================

export interface LeadConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  channel?: string;
}

export interface LeadRecord {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  channel?: string;
  conversations: LeadConversationEntry[];
  referral_source?: string;
  lead_status: "new" | "engaged" | "qualified" | "converted" | "lost";
  converted_tenant_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// EMERGENCY CONTACTS
// ============================================================================

export interface EmergencyContact {
  id: string;
  tenant_id: string;
  phone: string;
  name?: string;
  relationship?: string;
  verified: boolean;
  is_primary: boolean;
  verified_at?: string;
}

// ============================================================================
// BIRTH FLOW
// ============================================================================

export type BirthPhase = "greeting" | "discovery" | "preferences" | "stable";

export interface BirthFlowState {
  phase: BirthPhase;
  exchange_count: number;
  personality_set: boolean;
  emergency_contact_set: boolean;
  extracted_profile: Record<string, unknown>;
}
