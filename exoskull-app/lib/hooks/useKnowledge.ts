'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loop,
  Campaign,
  Quest,
  Op,
  Note,
  NoteType,
  LoopsResponse,
  CampaignsResponse,
  QuestsResponse,
  OpsResponse,
  NotesResponse,
} from '@/lib/types/knowledge'

// ============================================================================
// useLoops
// ============================================================================

export function useLoops(tenantId: string, withStats = true) {
  const [loops, setLoops] = useState<Loop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId, withStats: String(withStats) })
      const res = await fetch(`/api/knowledge/loops?${params}`)
      if (!res.ok) throw new Error('Failed to fetch loops')
      const data: LoopsResponse = await res.json()
      setLoops(data.loops)
    } catch (err) {
      console.error('[useLoops] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId, withStats])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { loops, loading, error, refetch }
}

// ============================================================================
// useCampaigns
// ============================================================================

export function useCampaigns(tenantId: string, loopSlug?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId })
      if (loopSlug) params.set('loopSlug', loopSlug)
      const res = await fetch(`/api/knowledge/campaigns?${params}`)
      if (!res.ok) throw new Error('Failed to fetch campaigns')
      const data: CampaignsResponse = await res.json()
      setCampaigns(data.campaigns)
      setTotal(data.total)
    } catch (err) {
      console.error('[useCampaigns] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId, loopSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { campaigns, total, loading, error, refetch }
}

// ============================================================================
// useQuests
// ============================================================================

export function useQuests(tenantId: string, campaignId?: string, loopSlug?: string) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId })
      if (campaignId) params.set('campaignId', campaignId)
      if (loopSlug) params.set('loopSlug', loopSlug)
      const res = await fetch(`/api/knowledge/quests?${params}`)
      if (!res.ok) throw new Error('Failed to fetch quests')
      const data: QuestsResponse = await res.json()
      setQuests(data.quests)
      setTotal(data.total)
    } catch (err) {
      console.error('[useQuests] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId, campaignId, loopSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { quests, total, loading, error, refetch }
}

// ============================================================================
// useOps
// ============================================================================

export function useOps(tenantId: string, questId?: string, loopSlug?: string) {
  const [ops, setOps] = useState<Op[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId })
      if (questId) params.set('questId', questId)
      if (loopSlug) params.set('loopSlug', loopSlug)
      const res = await fetch(`/api/knowledge/ops?${params}`)
      if (!res.ok) throw new Error('Failed to fetch ops')
      const data: OpsResponse = await res.json()
      setOps(data.ops)
      setTotal(data.total)
    } catch (err) {
      console.error('[useOps] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId, questId, loopSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { ops, total, loading, error, refetch }
}

// ============================================================================
// useNotes
// ============================================================================

interface UseNotesOptions {
  type?: NoteType
  loopSlug?: string
  questId?: string
  search?: string
  limit?: number
  offset?: number
}

export function useNotes(tenantId: string, options: UseNotesOptions = {}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { type, loopSlug, questId, search, limit = 20, offset = 0 } = options

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId, limit: String(limit), offset: String(offset) })
      if (type) params.set('type', type)
      if (loopSlug) params.set('loopSlug', loopSlug)
      if (questId) params.set('questId', questId)
      if (search) params.set('search', search)
      const res = await fetch(`/api/knowledge/notes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch notes')
      const data: NotesResponse = await res.json()
      setNotes(data.notes)
      setTotal(data.total)
    } catch (err) {
      console.error('[useNotes] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId, type, loopSlug, questId, search, limit, offset])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { notes, total, loading, error, refetch }
}

// ============================================================================
// useDocuments
// ============================================================================

interface Document {
  id: string
  filename: string
  original_name: string
  file_type: string
  file_size: number
  category: string
  status: string
  created_at: string
}

interface DocumentsResponse {
  documents: Document[]
  total: number
}

export function useDocuments(tenantId: string) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenantId })
      const res = await fetch(`/api/knowledge?${params}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data: DocumentsResponse = await res.json()
      setDocuments(data.documents || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('[useDocuments] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { documents, total, loading, error, refetch }
}
