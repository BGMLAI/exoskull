/**
 * ExoSkull Onboarding System Types
 */

// Onboarding step names
export type OnboardingStep = 1 | 2 | 3 | 4 | 5

export const ONBOARDING_STEPS = {
  1: 'basics',
  2: 'discovery',
  3: 'confirm',
  4: 'schedule',
  5: 'voice_pin',
} as const

export const STEP_NAMES: Record<OnboardingStep, string> = {
  1: 'Podstawy',
  2: 'Poznajmy się',
  3: 'Potwierdzenie',
  4: 'Pierwszy check-in',
  5: 'PIN głosowy',
}

// Onboarding status
export type OnboardingStatus = 'pending' | 'in_progress' | 'completed'

// Communication styles
export type CommunicationStyle = 'direct' | 'warm' | 'coaching'

export const COMMUNICATION_STYLES: Record<CommunicationStyle, { label: string; description: string }> = {
  direct: {
    label: 'Bezpośredni',
    description: 'Konkretnie, bez lukru. Fakty i działanie.',
  },
  warm: {
    label: 'Ciepły',
    description: 'Empatyczny, wspierający. Rozumienie i motywacja.',
  },
  coaching: {
    label: 'Coach',
    description: 'Pytania, refleksja. Pomagam Ci znaleźć odpowiedzi.',
  },
}

// Preferred channel
export type PreferredChannel = 'voice' | 'sms' | 'email'

export const PREFERRED_CHANNELS: Record<PreferredChannel, { label: string; description: string }> = {
  voice: {
    label: 'Głos',
    description: 'Zadzwonię do Ciebie',
  },
  sms: {
    label: 'SMS',
    description: 'Wyślę wiadomość tekstową',
  },
  email: {
    label: 'Email',
    description: 'Napiszę maila',
  },
}

// Primary goals
export type PrimaryGoal =
  | 'sleep'
  | 'productivity'
  | 'health'
  | 'fitness'
  | 'mental_health'
  | 'finance'
  | 'relationships'
  | 'learning'
  | 'parenting'
  | 'career'

export const PRIMARY_GOALS: Record<PrimaryGoal, { label: string; emoji: string }> = {
  sleep: { label: 'Lepszy sen', emoji: '😴' },
  productivity: { label: 'Produktywność', emoji: '⚡' },
  health: { label: 'Zdrowie', emoji: '💪' },
  fitness: { label: 'Forma fizyczna', emoji: '🏃' },
  mental_health: { label: 'Zdrowie psychiczne', emoji: '🧠' },
  finance: { label: 'Finanse', emoji: '💰' },
  relationships: { label: 'Relacje', emoji: '❤️' },
  learning: { label: 'Nauka', emoji: '📚' },
  parenting: { label: 'Rodzicielstwo', emoji: '👶' },
  career: { label: 'Kariera', emoji: '💼' },
}

// Conditions
export type Condition =
  | 'adhd'
  | 'anxiety'
  | 'depression'
  | 'burnout'
  | 'insomnia'
  | 'ocd'
  | 'ptsd'
  | 'autism'
  | 'bipolar'
  | 'addiction'
  | 'none'

export const CONDITIONS: Record<Condition, { label: string }> = {
  adhd: { label: 'ADHD' },
  anxiety: { label: 'Lęk / Anxiety' },
  depression: { label: 'Depresja' },
  burnout: { label: 'Wypalenie' },
  insomnia: { label: 'Bezsenność' },
  ocd: { label: 'OCD' },
  ptsd: { label: 'PTSD' },
  autism: { label: 'Autyzm / Spektrum' },
  bipolar: { label: 'Choroba dwubiegunowa' },
  addiction: { label: 'Uzależnienie' },
  none: { label: 'Brak' },
}

// Step 1: Quick Basics data
export interface QuickBasicsData {
  preferred_name: string
  timezone: string
  language: string
  phone?: string
}

// Step 2: Discovery data (extracted from conversation)
export interface DiscoveryData {
  primary_goal: PrimaryGoal | null
  secondary_goals: PrimaryGoal[]
  conditions: Condition[]
  communication_style: CommunicationStyle
  preferred_channel: PreferredChannel
  devices: string[]
  insights: string[]
  raw_transcript?: string
}

// Step 4: Schedule data
export interface ScheduleData {
  morning_checkin_time: string // "07:00"
  evening_checkin_time?: string // "21:00"
  checkin_enabled: boolean
  preferred_channel: PreferredChannel
}

// Step 5: Voice PIN data
export interface VoicePinData {
  pin: string // 4 digits
  confirmed: boolean
}

// Full onboarding state
export interface OnboardingState {
  currentStep: OnboardingStep
  status: OnboardingStatus
  basics: QuickBasicsData | null
  discovery: DiscoveryData | null
  schedule: ScheduleData | null
  voicePin: VoicePinData | null
}

// Profile extraction from AI
export interface ProfileExtraction {
  primary_goal: PrimaryGoal | null
  secondary_goals: PrimaryGoal[]
  conditions: Condition[]
  communication_style: CommunicationStyle
  preferred_channel: PreferredChannel
  morning_time?: string
  evening_time?: string
  devices: string[]
  insights: string[]
  confidence: number
}

// API response types
export interface OnboardingStatusResponse {
  status: OnboardingStatus
  currentStep: number
  completedAt: string | null
  basics: QuickBasicsData | null
  discovery: DiscoveryData | null
}

export interface SaveStepRequest {
  step: OnboardingStep
  data: QuickBasicsData | DiscoveryData | ScheduleData | VoicePinData
}

export interface SaveStepResponse {
  success: boolean
  nextStep: OnboardingStep | null
  error?: string
}
