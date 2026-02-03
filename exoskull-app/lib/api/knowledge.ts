/**
 * Knowledge API Helper Functions
 * CRUD operations for Loops, Campaigns, Quests, Ops, Notes
 */

import {
  CreateLoopInput,
  CreateCampaignInput,
  CreateQuestInput,
  CreateOpInput,
  CreateNoteInput,
  Loop,
  Campaign,
  Quest,
  Op,
  Note,
  OpStatus,
} from '@/lib/types/knowledge'

// ============================================================================
// LOOPS
// ============================================================================

export async function createLoop(tenantId: string, input: CreateLoopInput): Promise<Loop> {
  const res = await fetch('/api/knowledge/loops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad tworzenia loop')
  }

  const data = await res.json()
  return data.loop
}

export async function updateLoop(
  tenantId: string,
  loopId: string,
  input: Partial<CreateLoopInput>
): Promise<Loop> {
  const res = await fetch('/api/knowledge/loops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, loopId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad aktualizacji loop')
  }

  const data = await res.json()
  return data.loop
}

export async function deleteLoop(tenantId: string, loopId: string): Promise<void> {
  const res = await fetch('/api/knowledge/loops', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, loopId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania loop')
  }
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export async function createCampaign(tenantId: string, input: CreateCampaignInput): Promise<Campaign> {
  const res = await fetch('/api/knowledge/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad tworzenia campaign')
  }

  const data = await res.json()
  return data.campaign
}

export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  input: Partial<CreateCampaignInput> & { status?: string }
): Promise<Campaign> {
  const res = await fetch('/api/knowledge/campaigns', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, campaignId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad aktualizacji campaign')
  }

  const data = await res.json()
  return data.campaign
}

export async function deleteCampaign(tenantId: string, campaignId: string): Promise<void> {
  const res = await fetch('/api/knowledge/campaigns', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, campaignId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania campaign')
  }
}

// ============================================================================
// QUESTS
// ============================================================================

export async function createQuest(tenantId: string, input: CreateQuestInput): Promise<Quest> {
  const res = await fetch('/api/knowledge/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad tworzenia quest')
  }

  const data = await res.json()
  return data.quest
}

export async function updateQuest(
  tenantId: string,
  questId: string,
  input: Partial<CreateQuestInput> & { status?: string }
): Promise<Quest> {
  const res = await fetch('/api/knowledge/quests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, questId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad aktualizacji quest')
  }

  const data = await res.json()
  return data.quest
}

export async function deleteQuest(tenantId: string, questId: string): Promise<void> {
  const res = await fetch('/api/knowledge/quests', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, questId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania quest')
  }
}

// ============================================================================
// OPS
// ============================================================================

export async function createOp(tenantId: string, input: CreateOpInput): Promise<Op> {
  const res = await fetch('/api/knowledge/ops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad tworzenia op')
  }

  const data = await res.json()
  return data.op
}

export async function updateOp(
  tenantId: string,
  opId: string,
  input: Partial<CreateOpInput> & { status?: OpStatus }
): Promise<Op> {
  const res = await fetch('/api/knowledge/ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, opId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad aktualizacji op')
  }

  const data = await res.json()
  return data.op
}

export async function toggleOpStatus(tenantId: string, opId: string, currentStatus: OpStatus): Promise<Op> {
  const newStatus: OpStatus = currentStatus === 'completed' ? 'pending' : 'completed'
  return updateOp(tenantId, opId, { status: newStatus })
}

export async function deleteOp(tenantId: string, opId: string): Promise<void> {
  const res = await fetch('/api/knowledge/ops', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, opId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania op')
  }
}

// ============================================================================
// NOTES
// ============================================================================

export async function createNote(tenantId: string, input: CreateNoteInput): Promise<Note> {
  const res = await fetch('/api/knowledge/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad tworzenia note')
  }

  const data = await res.json()
  return data.note
}

export async function updateNote(
  tenantId: string,
  noteId: string,
  input: Partial<CreateNoteInput>
): Promise<Note> {
  const res = await fetch('/api/knowledge/notes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, noteId, ...input }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad aktualizacji note')
  }

  const data = await res.json()
  return data.note
}

export async function deleteNote(tenantId: string, noteId: string): Promise<void> {
  const res = await fetch('/api/knowledge/notes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, noteId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania note')
  }
}

// ============================================================================
// DOCUMENTS (File Uploads)
// ============================================================================

export interface UploadDocumentResult {
  id: string
  filename: string
  status: string
  category: string
}

export async function uploadDocument(
  tenantId: string,
  file: File,
  category?: string
): Promise<UploadDocumentResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('tenant_id', tenantId)
  if (category) formData.append('category', category)

  const res = await fetch('/api/knowledge/upload', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad uploadu pliku')
  }

  const data = await res.json()
  return data.document
}

export async function deleteDocument(tenantId: string, documentId: string): Promise<void> {
  const res = await fetch('/api/knowledge', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, documentId }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Blad usuwania dokumentu')
  }
}
