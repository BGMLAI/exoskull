// Knowledge Layer types (Tyrolka Framework)
// Hierarchy: Loops > Campaigns > Quests > Ops > Notes

// ============================================================================
// LOOPS (Areas/Domains of Life)
// ============================================================================

export interface Loop {
  id: string
  tenant_id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  priority: number
  last_activity_at: string | null
  attention_score: number | null
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  // Computed stats (optional)
  stats?: {
    activeOps: number
    activeQuests: number
    totalNotes: number
  }
}

export const DEFAULT_LOOPS: Array<{ slug: string; name: string; icon: string; color: string }> = [
  { slug: 'health', name: 'Zdrowie', icon: '🏥', color: '#10B981' },
  { slug: 'work', name: 'Praca', icon: '💼', color: '#3B82F6' },
  { slug: 'relationships', name: 'Relacje', icon: '👥', color: '#EC4899' },
  { slug: 'finance', name: 'Finanse', icon: '💰', color: '#F59E0B' },
  { slug: 'growth', name: 'Rozwój', icon: '🌱', color: '#8B5CF6' },
  { slug: 'creativity', name: 'Kreatywność', icon: '🎨', color: '#F472B6' },
  { slug: 'fun', name: 'Rozrywka', icon: '🎮', color: '#22D3EE' },
]

// ============================================================================
// CAMPAIGNS (Major Initiatives)
// ============================================================================

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export interface Campaign {
  id: string
  tenant_id: string
  title: string
  vision: string | null
  status: CampaignStatus
  objective_ids: string[] | null
  loop_slug: string | null
  start_date: string | null
  target_date: string | null
  total_quests: number
  completed_quests: number
  created_at: string
  updated_at: string
}

// ============================================================================
// QUESTS (Projects)
// ============================================================================

export type QuestStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export interface Quest {
  id: string
  tenant_id: string
  campaign_id: string | null
  title: string
  description: string | null
  status: QuestStatus
  loop_slug: string | null
  target_ops: number | null
  completed_ops: number
  start_date: string | null
  deadline: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

// ============================================================================
// OPS (Tasks/Missions)
// ============================================================================

export type OpStatus = 'pending' | 'active' | 'completed' | 'dropped' | 'blocked'

export interface Op {
  id: string
  tenant_id: string
  quest_id: string | null
  title: string
  description: string | null
  status: OpStatus
  priority: number
  due_date: string | null
  scheduled_for: string | null
  estimated_effort: number | null
  actual_effort: number | null
  loop_slug: string | null
  tags: string[]
  is_recurring: boolean
  recurrence_rule: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// NOTES (Universal Content)
// ============================================================================

export type NoteType = 'text' | 'image' | 'audio' | 'video' | 'url' | 'social' | 'message' | 'document' | 'code'

export interface Note {
  id: string
  tenant_id: string
  type: NoteType
  title: string | null
  content: string | null
  media_url: string | null
  source_url: string | null
  metadata: Record<string, unknown>
  op_id: string | null
  quest_id: string | null
  loop_slug: string | null
  tags: string[]
  is_research: boolean
  is_experience: boolean
  embedding: number[] | null
  ai_summary: string | null
  ai_tags: string[] | null
  ai_category: string | null
  processed_at: string | null
  source_type: string | null
  source_id: string | null
  captured_at: string
  created_at: string
  updated_at: string
}

export const NOTE_TYPE_LABELS: Record<NoteType, { label: string; icon: string }> = {
  text: { label: 'Tekst', icon: '📝' },
  image: { label: 'Obraz', icon: '🖼️' },
  audio: { label: 'Audio', icon: '🎵' },
  video: { label: 'Wideo', icon: '🎬' },
  url: { label: 'Link', icon: '🔗' },
  social: { label: 'Social', icon: '📱' },
  message: { label: 'Wiadomość', icon: '💬' },
  document: { label: 'Dokument', icon: '📄' },
  code: { label: 'Kod', icon: '💻' },
}

// ============================================================================
// STATUS LABELS
// ============================================================================

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-gray-500' },
  active: { label: 'Aktywna', color: 'bg-green-500' },
  paused: { label: 'Wstrzymana', color: 'bg-yellow-500' },
  completed: { label: 'Zakończona', color: 'bg-blue-500' },
  archived: { label: 'Zarchiwizowana', color: 'bg-gray-400' },
}

export const QUEST_STATUS_LABELS: Record<QuestStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-gray-500' },
  active: { label: 'Aktywny', color: 'bg-green-500' },
  paused: { label: 'Wstrzymany', color: 'bg-yellow-500' },
  completed: { label: 'Zakończony', color: 'bg-blue-500' },
  archived: { label: 'Zarchiwizowany', color: 'bg-gray-400' },
}

export const OP_STATUS_LABELS: Record<OpStatus, { label: string; color: string }> = {
  pending: { label: 'Do zrobienia', color: 'bg-gray-500' },
  active: { label: 'W trakcie', color: 'bg-blue-500' },
  completed: { label: 'Ukończone', color: 'bg-green-500' },
  dropped: { label: 'Porzucone', color: 'bg-red-500' },
  blocked: { label: 'Zablokowane', color: 'bg-orange-500' },
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface LoopsResponse {
  loops: Loop[]
}

export interface CampaignsResponse {
  campaigns: Campaign[]
  total: number
  limit: number
  offset: number
}

export interface QuestsResponse {
  quests: Quest[]
  total: number
  limit: number
  offset: number
}

export interface OpsResponse {
  ops: Op[]
  total: number
  limit: number
  offset: number
}

export interface NotesResponse {
  notes: Note[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// FORM TYPES (for creating/editing)
// ============================================================================

export interface CreateLoopInput {
  slug: string
  name: string
  description?: string
  icon?: string
  color?: string
  priority?: number
}

export interface CreateCampaignInput {
  title: string
  vision?: string
  loopSlug?: string
  objectiveIds?: string[]
  startDate?: string
  targetDate?: string
}

export interface CreateQuestInput {
  title: string
  description?: string
  campaignId?: string
  loopSlug?: string
  targetOps?: number
  startDate?: string
  deadline?: string
  tags?: string[]
}

export interface CreateOpInput {
  title: string
  description?: string
  questId?: string
  loopSlug?: string
  priority?: number
  dueDate?: string
  scheduledFor?: string
  estimatedEffort?: number
  tags?: string[]
  isRecurring?: boolean
  recurrenceRule?: string
}

export interface CreateNoteInput {
  type: NoteType
  title?: string
  content?: string
  mediaUrl?: string
  sourceUrl?: string
  metadata?: Record<string, unknown>
  opId?: string
  questId?: string
  loopSlug?: string
  tags?: string[]
  isResearch?: boolean
  isExperience?: boolean
  sourceType?: string
  sourceId?: string
  capturedAt?: string
}
