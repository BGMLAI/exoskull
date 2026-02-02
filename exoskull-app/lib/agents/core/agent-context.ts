/**
 * Agent Context Manager
 *
 * Manages shared context across agent invocations.
 * Provides utilities for creating and validating contexts.
 */

import { AgentContext } from '../types'

// Maximum nesting depth for agents spawning other agents
const MAX_AGENT_DEPTH = 3

/**
 * Create a new agent context
 */
export function createAgentContext(
  tenantId: string,
  options?: {
    conversationId?: string
    parentAgentId?: string
    parentDepth?: number
    metadata?: Record<string, unknown>
  }
): AgentContext {
  const depth = options?.parentDepth !== undefined ? options.parentDepth + 1 : 0

  if (depth > MAX_AGENT_DEPTH) {
    throw new Error(
      `Agent nesting depth exceeded (max: ${MAX_AGENT_DEPTH}). ` +
        `This prevents infinite agent loops.`
    )
  }

  return {
    tenantId,
    conversationId: options?.conversationId,
    parentAgentId: options?.parentAgentId,
    depth,
    startedAt: new Date().toISOString(),
    metadata: options?.metadata,
  }
}

/**
 * Create a child context for agent spawning another agent
 */
export function createChildContext(
  parent: AgentContext,
  childAgentId: string,
  additionalMetadata?: Record<string, unknown>
): AgentContext {
  return createAgentContext(parent.tenantId, {
    conversationId: parent.conversationId,
    parentAgentId: childAgentId,
    parentDepth: parent.depth,
    metadata: {
      ...parent.metadata,
      ...additionalMetadata,
      parentChain: [
        ...(parent.metadata?.parentChain as string[] || []),
        parent.parentAgentId,
      ].filter(Boolean),
    },
  })
}

/**
 * Validate an agent context
 */
export function validateContext(context: AgentContext): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!context.tenantId) {
    errors.push('tenantId is required')
  }

  if (context.depth > MAX_AGENT_DEPTH) {
    errors.push(`depth exceeds maximum (${MAX_AGENT_DEPTH})`)
  }

  if (!context.startedAt) {
    errors.push('startedAt is required')
  }

  // Check for circular references in parent chain
  const parentChain = context.metadata?.parentChain as string[] | undefined
  if (parentChain) {
    const uniqueParents = new Set(parentChain)
    if (uniqueParents.size !== parentChain.length) {
      errors.push('Circular agent reference detected in parentChain')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Serialize context for logging
 */
export function serializeContext(context: AgentContext): string {
  return JSON.stringify({
    tenantId: context.tenantId,
    conversationId: context.conversationId,
    parentAgentId: context.parentAgentId,
    depth: context.depth,
    startedAt: context.startedAt,
    // Don't serialize full metadata for logs
    hasMetadata: Boolean(context.metadata),
  })
}

/**
 * Check if context allows spawning more agents
 */
export function canSpawnChild(context: AgentContext): boolean {
  return context.depth < MAX_AGENT_DEPTH
}

/**
 * Get context age in milliseconds
 */
export function getContextAge(context: AgentContext): number {
  return Date.now() - new Date(context.startedAt).getTime()
}

/**
 * Check if context is stale (older than specified milliseconds)
 */
export function isContextStale(
  context: AgentContext,
  maxAgeMs: number = 5 * 60 * 1000 // 5 minutes default
): boolean {
  return getContextAge(context) > maxAgeMs
}
