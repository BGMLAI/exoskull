/**
 * Autonomy Execute API
 *
 * Execute autonomous actions and run MAPE-K cycles.
 * Supports:
 * - Running full MAPE-K autonomy cycles
 * - Executing individual actions
 * - Approving/rejecting interventions
 * - Recording intervention feedback
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  runAutonomyCycle,
  executeAction,
  getPermissionModel,
} from '@/lib/autonomy'
import { detectGaps, optimizeSystem, checkAndSpawnAgents } from '@/lib/agents'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// POST - Execute autonomy operations
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { operation, tenantId, ...params } = body

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId required' },
        { status: 400 }
      )
    }

    if (!operation) {
      return NextResponse.json(
        { error: 'operation required (run_cycle, execute_action, approve, reject, feedback, detect_gaps, optimize, spawn_agents)' },
        { status: 400 }
      )
    }

    let result: Record<string, unknown>

    switch (operation) {
      case 'run_cycle':
        result = await handleRunCycle(tenantId, params)
        break

      case 'execute_action':
        result = await handleExecuteAction(tenantId, params)
        break

      case 'approve':
        result = await handleApprove(tenantId, params)
        break

      case 'reject':
        result = await handleReject(tenantId, params)
        break

      case 'feedback':
        result = await handleFeedback(tenantId, params)
        break

      case 'detect_gaps':
        result = await handleDetectGaps(tenantId, params)
        break

      case 'optimize':
        result = await handleOptimize(tenantId, params)
        break

      case 'spawn_agents':
        result = await handleSpawnAgents(tenantId)
        break

      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Autonomy Execute] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET - Get autonomy status and pending interventions
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const type = searchParams.get('type') || 'pending'

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId required' },
        { status: 400 }
      )
    }

    switch (type) {
      case 'pending':
        return await getPendingInterventions(tenantId)

      case 'history':
        return await getInterventionHistory(tenantId, searchParams)

      case 'cycles':
        return await getCycleHistory(tenantId, searchParams)

      case 'grants':
        return await getAutonomyGrants(tenantId)

      case 'stats':
        return await getAutonomyStats(tenantId, searchParams)

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Autonomy Execute] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// OPERATION HANDLERS
// ============================================================================

async function handleRunCycle(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const trigger = (params.trigger as 'cron' | 'event' | 'manual') || 'manual'
  const triggerEvent = params.triggerEvent as string | undefined

  console.log(`[Autonomy Execute] Running MAPE-K cycle for ${tenantId}`)

  const result = await runAutonomyCycle(tenantId, trigger, triggerEvent)

  return {
    success: result.success,
    cycleId: result.cycleId,
    durationMs: result.durationMs,
    interventionsProposed: result.plan.interventions.length,
    interventionsExecuted: result.execute.interventionsExecuted,
    issues: result.analyze.issues.length,
    gaps: result.analyze.gaps.length,
    error: result.error,
  }
}

async function handleExecuteAction(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const actionType = params.actionType as string
  const actionParams = params.params as Record<string, unknown>

  if (!actionType) {
    throw new Error('actionType required')
  }

  console.log(`[Autonomy Execute] Executing action ${actionType} for ${tenantId}`)

  const result = await executeAction({
    type: actionType as any,
    tenantId,
    params: actionParams || {},
  })

  return {
    success: result.success,
    actionType: result.actionType,
    data: result.data,
    error: result.error,
    durationMs: result.durationMs,
  }
}

async function handleApprove(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const interventionId = params.interventionId as string

  if (!interventionId) {
    throw new Error('interventionId required')
  }

  console.log(`[Autonomy Execute] Approving intervention ${interventionId}`)

  const { data, error } = await supabase.rpc('approve_intervention', {
    p_intervention_id: interventionId,
    p_approved_by: 'user',
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    success: data === true,
    interventionId,
    status: 'approved',
  }
}

async function handleReject(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const interventionId = params.interventionId as string
  const reason = params.reason as string

  if (!interventionId) {
    throw new Error('interventionId required')
  }

  console.log(`[Autonomy Execute] Rejecting intervention ${interventionId}`)

  const { error } = await supabase
    .from('exo_interventions')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', interventionId)
    .eq('tenant_id', tenantId)

  if (error) {
    throw new Error(error.message)
  }

  return {
    success: true,
    interventionId,
    status: 'rejected',
    reason,
  }
}

async function handleFeedback(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const interventionId = params.interventionId as string
  const feedback = params.feedback as string
  const notes = params.notes as string

  if (!interventionId || !feedback) {
    throw new Error('interventionId and feedback required')
  }

  if (!['helpful', 'neutral', 'unhelpful', 'harmful'].includes(feedback)) {
    throw new Error('feedback must be: helpful, neutral, unhelpful, or harmful')
  }

  console.log(`[Autonomy Execute] Recording feedback for ${interventionId}`)

  const { error } = await supabase.rpc('record_intervention_feedback', {
    p_intervention_id: interventionId,
    p_feedback: feedback,
    p_notes: notes || null,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    success: true,
    interventionId,
    feedback,
  }
}

async function handleDetectGaps(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const forceRun = params.forceRun as boolean ?? true

  console.log(`[Autonomy Execute] Detecting gaps for ${tenantId}`)

  const result = await detectGaps(tenantId, forceRun)

  return {
    success: result.success,
    result: result.result,
    error: result.error,
  }
}

async function handleOptimize(
  tenantId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const forceRun = params.forceRun as boolean ?? true

  console.log(`[Autonomy Execute] Running self-optimization for ${tenantId}`)

  const result = await optimizeSystem(tenantId, forceRun)

  return {
    success: result.success,
    result: result.result,
    error: result.error,
  }
}

async function handleSpawnAgents(
  tenantId: string
): Promise<Record<string, unknown>> {
  console.log(`[Autonomy Execute] Checking for agent spawning for ${tenantId}`)

  const result = await checkAndSpawnAgents(tenantId)

  return {
    success: result.success,
    result: result.result,
    error: result.error,
  }
}

// ============================================================================
// GET HANDLERS
// ============================================================================

async function getPendingInterventions(tenantId: string) {
  const { data, error } = await supabase.rpc('get_pending_interventions', {
    p_tenant_id: tenantId,
    p_limit: 20,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    interventions: data || [],
    count: data?.length || 0,
  })
}

async function getInterventionHistory(
  tenantId: string,
  searchParams: URLSearchParams
) {
  const limit = parseInt(searchParams.get('limit') || '50')
  const status = searchParams.get('status')

  let query = supabase
    .from('exo_interventions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    interventions: data || [],
    count: data?.length || 0,
  })
}

async function getCycleHistory(
  tenantId: string,
  searchParams: URLSearchParams
) {
  const limit = parseInt(searchParams.get('limit') || '20')

  const { data, error } = await supabase
    .from('exo_mapek_cycles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    cycles: data || [],
    count: data?.length || 0,
  })
}

async function getAutonomyGrants(tenantId: string) {
  const permissionModel = getPermissionModel()
  const grants = await permissionModel.getUserGrants(tenantId)
  const byCategory = await permissionModel.getGrantsByCategory(tenantId)

  return NextResponse.json({
    grants,
    byCategory,
    total: grants.length,
  })
}

async function getAutonomyStats(
  tenantId: string,
  searchParams: URLSearchParams
) {
  const days = parseInt(searchParams.get('days') || '30')

  const { data: interventionStats } = await supabase.rpc('get_intervention_stats', {
    p_tenant_id: tenantId,
    p_days: days,
  })

  const { data: agentStats } = await supabase.rpc('get_agent_stats', {
    p_tenant_id: tenantId,
    p_days: days,
  })

  // Get cycle stats
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { count: totalCycles } = await supabase
    .from('exo_mapek_cycles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('started_at', cutoff.toISOString())

  const { count: successfulCycles } = await supabase
    .from('exo_mapek_cycles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('started_at', cutoff.toISOString())

  return NextResponse.json({
    period: `${days} days`,
    interventions: interventionStats || [],
    agents: agentStats || [],
    cycles: {
      total: totalCycles || 0,
      successful: successfulCycles || 0,
      successRate: totalCycles ? (successfulCycles || 0) / totalCycles : 0,
    },
  })
}
