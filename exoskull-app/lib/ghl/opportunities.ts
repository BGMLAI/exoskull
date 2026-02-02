/**
 * GHL Opportunities Library
 *
 * Sales pipeline and opportunity management via GHL API:
 * - Pipeline CRUD
 * - Opportunity tracking
 * - Stage management
 */

import { GHLClient, ghlRateLimiter } from './client'

export interface Pipeline {
  id: string
  locationId: string
  name: string
  stages: PipelineStage[]
}

export interface PipelineStage {
  id: string
  name: string
  position: number
}

export interface Opportunity {
  id: string
  locationId: string
  pipelineId: string
  pipelineStageId: string
  contactId: string
  name: string
  monetaryValue?: number
  status: 'open' | 'won' | 'lost' | 'abandoned'
  assignedTo?: string
  source?: string
  notes?: string
  customFields?: Array<{ id: string; value: string | number | boolean }>
  dateAdded?: string
  dateUpdated?: string
  lastStatusChangeAt?: string
}

export interface CreateOpportunityParams {
  pipelineId: string
  pipelineStageId: string
  contactId: string
  name: string
  monetaryValue?: number
  status?: 'open' | 'won' | 'lost' | 'abandoned'
  assignedTo?: string
  source?: string
  notes?: string
  customFields?: Array<{ id: string; value: string | number | boolean }>
}

/**
 * Get all pipelines
 */
export async function getPipelines(
  client: GHLClient
): Promise<{ pipelines: Pipeline[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ pipelines: Pipeline[] }>('/opportunities/pipelines', { locationId })
}

/**
 * Get pipeline by ID
 */
export async function getPipeline(
  client: GHLClient,
  pipelineId: string
): Promise<{ pipeline: Pipeline }> {
  await ghlRateLimiter.throttle()
  return client.get<{ pipeline: Pipeline }>(`/opportunities/pipelines/${pipelineId}`)
}

/**
 * Create an opportunity
 */
export async function createOpportunity(
  client: GHLClient,
  params: CreateOpportunityParams
): Promise<{ opportunity: Opportunity }> {
  await ghlRateLimiter.throttle()
  return client.post<{ opportunity: Opportunity }>('/opportunities/', {
    ...params,
    locationId: client.getLocationId(),
  })
}

/**
 * Get opportunity by ID
 */
export async function getOpportunity(
  client: GHLClient,
  opportunityId: string
): Promise<{ opportunity: Opportunity }> {
  await ghlRateLimiter.throttle()
  return client.get<{ opportunity: Opportunity }>(`/opportunities/${opportunityId}`)
}

/**
 * Update an opportunity
 */
export async function updateOpportunity(
  client: GHLClient,
  opportunityId: string,
  params: Partial<CreateOpportunityParams>
): Promise<{ opportunity: Opportunity }> {
  await ghlRateLimiter.throttle()
  return client.put<{ opportunity: Opportunity }>(`/opportunities/${opportunityId}`, params)
}

/**
 * Delete an opportunity
 */
export async function deleteOpportunity(
  client: GHLClient,
  opportunityId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ success: boolean }>(`/opportunities/${opportunityId}`)
}

/**
 * Search opportunities
 */
export async function searchOpportunities(
  client: GHLClient,
  params?: {
    pipelineId?: string
    pipelineStageId?: string
    contactId?: string
    status?: string
    assignedTo?: string
    limit?: number
    skip?: number
  }
): Promise<{ opportunities: Opportunity[]; total: number }> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()
  const queryParams: Record<string, string> = {
    locationId,
  }

  if (params?.pipelineId) queryParams.pipelineId = params.pipelineId
  if (params?.pipelineStageId) queryParams.pipelineStageId = params.pipelineStageId
  if (params?.contactId) queryParams.contactId = params.contactId
  if (params?.status) queryParams.status = params.status
  if (params?.assignedTo) queryParams.assignedTo = params.assignedTo
  if (params?.limit) queryParams.limit = params.limit.toString()
  if (params?.skip) queryParams.skip = params.skip.toString()

  return client.get<{ opportunities: Opportunity[]; total: number }>('/opportunities/', queryParams)
}

/**
 * Move opportunity to a different stage
 */
export async function moveOpportunityToStage(
  client: GHLClient,
  opportunityId: string,
  stageId: string
): Promise<{ opportunity: Opportunity }> {
  return updateOpportunity(client, opportunityId, {
    pipelineStageId: stageId,
  })
}

/**
 * Update opportunity status (won/lost/abandoned)
 */
export async function updateOpportunityStatus(
  client: GHLClient,
  opportunityId: string,
  status: 'open' | 'won' | 'lost' | 'abandoned'
): Promise<{ opportunity: Opportunity }> {
  return updateOpportunity(client, opportunityId, { status })
}

/**
 * Get opportunities for a contact
 */
export async function getContactOpportunities(
  client: GHLClient,
  contactId: string
): Promise<{ opportunities: Opportunity[] }> {
  const result = await searchOpportunities(client, { contactId })
  return { opportunities: result.opportunities }
}

// ============================================
// ExoSkull Pipeline Helpers
// ============================================

/**
 * ExoSkull predefined pipelines
 */
export const EXOSKULL_PIPELINES = {
  ONBOARDING: 'ExoSkull Onboarding',
  RETENTION: 'ExoSkull Retention',
  ENGAGEMENT: 'ExoSkull Engagement',
} as const

/**
 * ExoSkull onboarding stages
 */
export const ONBOARDING_STAGES = {
  DISCOVERY: 'Discovery',
  ACTIVE: 'Active',
  POWER_USER: 'Power User',
} as const

/**
 * ExoSkull retention stages
 */
export const RETENTION_STAGES = {
  ACTIVE: 'Active',
  AT_RISK: 'At Risk',
  CHURNED: 'Churned',
  RECOVERED: 'Recovered',
} as const

/**
 * Get pipeline by name
 */
export async function getPipelineByName(
  client: GHLClient,
  name: string
): Promise<Pipeline | null> {
  const { pipelines } = await getPipelines(client)
  return pipelines.find(p => p.name.toLowerCase() === name.toLowerCase()) || null
}

/**
 * Get stage by name within a pipeline
 */
export function getStageByName(
  pipeline: Pipeline,
  stageName: string
): PipelineStage | null {
  return pipeline.stages.find(
    s => s.name.toLowerCase() === stageName.toLowerCase()
  ) || null
}

/**
 * Move contact through ExoSkull onboarding pipeline
 */
export async function moveToOnboardingStage(
  client: GHLClient,
  contactId: string,
  stage: keyof typeof ONBOARDING_STAGES
): Promise<{ success: boolean; opportunity?: Opportunity; error?: string }> {
  const pipeline = await getPipelineByName(client, EXOSKULL_PIPELINES.ONBOARDING)

  if (!pipeline) {
    return { success: false, error: 'Onboarding pipeline not found' }
  }

  const targetStage = getStageByName(pipeline, ONBOARDING_STAGES[stage])
  if (!targetStage) {
    return { success: false, error: `Stage "${stage}" not found in onboarding pipeline` }
  }

  // Find existing opportunity for contact
  const { opportunities } = await searchOpportunities(client, {
    pipelineId: pipeline.id,
    contactId,
    limit: 1,
  })

  if (opportunities.length > 0) {
    // Update existing opportunity
    const { opportunity } = await moveOpportunityToStage(
      client,
      opportunities[0].id,
      targetStage.id
    )
    return { success: true, opportunity }
  } else {
    // Create new opportunity
    const { opportunity } = await createOpportunity(client, {
      pipelineId: pipeline.id,
      pipelineStageId: targetStage.id,
      contactId,
      name: `${contactId} - Onboarding`,
    })
    return { success: true, opportunity }
  }
}

/**
 * Update contact retention status
 */
export async function updateRetentionStatus(
  client: GHLClient,
  contactId: string,
  status: keyof typeof RETENTION_STAGES
): Promise<{ success: boolean; opportunity?: Opportunity; error?: string }> {
  const pipeline = await getPipelineByName(client, EXOSKULL_PIPELINES.RETENTION)

  if (!pipeline) {
    return { success: false, error: 'Retention pipeline not found' }
  }

  const targetStage = getStageByName(pipeline, RETENTION_STAGES[status])
  if (!targetStage) {
    return { success: false, error: `Stage "${status}" not found in retention pipeline` }
  }

  // Find existing opportunity
  const { opportunities } = await searchOpportunities(client, {
    pipelineId: pipeline.id,
    contactId,
    limit: 1,
  })

  if (opportunities.length > 0) {
    const { opportunity } = await moveOpportunityToStage(
      client,
      opportunities[0].id,
      targetStage.id
    )
    return { success: true, opportunity }
  } else {
    const { opportunity } = await createOpportunity(client, {
      pipelineId: pipeline.id,
      pipelineStageId: targetStage.id,
      contactId,
      name: `${contactId} - Retention`,
    })
    return { success: true, opportunity }
  }
}
