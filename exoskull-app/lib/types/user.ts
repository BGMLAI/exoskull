// User profile types matching exo_tenants table schema

export interface UserProfile {
  id: string
  email: string
  name: string | null
  phone: string | null

  // Onboarding status
  onboarding_status: 'pending' | 'in_progress' | 'completed'
  onboarding_step: number
  onboarding_completed_at: string | null

  // Profile from discovery conversation
  preferred_name: string | null
  age_range: string | null

  // Goals
  primary_goal: string | null  // sleep, productivity, health, fitness, mental_health, finance, relationships, learning, career
  secondary_goals: string[] | null

  // Conditions/challenges
  conditions: string[] | null  // adhd, anxiety, depression, burnout, insomnia, chronic_fatigue, etc.

  // Communication preferences
  communication_style: 'direct' | 'warm' | 'coaching' | null
  preferred_channel: 'voice' | 'sms' | 'email' | null

  // Check-in schedule
  morning_checkin_time: string | null  // HH:MM format
  evening_checkin_time: string | null  // HH:MM format
  checkin_enabled: boolean

  // Raw discovery data (full extraction JSON)
  discovery_data: Record<string, unknown> | null

  // Account settings
  timezone: string
  language: string

  // Subscription
  subscription_tier: 'free' | 'pro' | 'enterprise'
  subscription_status: 'active' | 'cancelled' | 'past_due'
  trial_ends_at: string | null

  // Timestamps
  created_at: string
  updated_at: string | null
}

// Context value interface
export interface UserContextValue {
  user: UserProfile | null
  isLoading: boolean
  error: string | null
  isFirstVisit: boolean
  refetch: () => Promise<void>
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>
}

// Goal labels for UI display
export const GOAL_LABELS: Record<string, string> = {
  sleep: 'Sen i regeneracja',
  productivity: 'Produktywnosc',
  health: 'Zdrowie ogolne',
  fitness: 'Fitness i aktywnosc',
  mental_health: 'Zdrowie psychiczne',
  finance: 'Finanse',
  relationships: 'Relacje',
  learning: 'Nauka i rozwoj',
  career: 'Kariera',
}

// Goal subtitles for dashboard
export const GOAL_SUBTITLES: Record<string, string> = {
  sleep: 'Jak sie dzis wyspales? Sprawdzmy Twoja energie.',
  productivity: 'Gotowy na produktywny dzien?',
  health: 'Dbajmy o Twoje zdrowie - sprawdzmy jak sie czujesz.',
  mental_health: 'Jak sie dzis czujesz? Jestem tu dla Ciebie.',
  fitness: 'Czas na trening? Sprawdzmy Twoje postepy.',
  finance: 'Kontroluj swoje finanse - oto podsumowanie.',
  relationships: 'Dbaj o relacje - kiedy ostatnio rozmawiałes z bliskimi?',
  learning: 'Czego sie dzis nauczysz?',
  career: 'Rozwijaj kariere - oto Twoje zadania.',
}

// Condition labels
export const CONDITION_LABELS: Record<string, string> = {
  adhd: 'ADHD',
  anxiety: 'Lek',
  depression: 'Depresja',
  burnout: 'Wypalenie',
  insomnia: 'Bezsennosc',
  chronic_fatigue: 'Chroniczne zmeczenie',
  ocd: 'OCD',
  bipolar: 'Choroba afektywna dwubiegunowa',
}

// Communication style labels
export const COMMUNICATION_STYLE_LABELS: Record<string, string> = {
  direct: 'Bezposredni - krotko i na temat',
  warm: 'Ciepły - przyjazny i wspierajacy',
  coaching: 'Coachingowy - pytania i refleksja',
}

// Channel labels
export const CHANNEL_LABELS: Record<string, string> = {
  voice: 'Glos (rozmowy telefoniczne)',
  sms: 'SMS',
  email: 'Email',
}
