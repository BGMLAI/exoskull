// =====================================================
// EXOSKULL TOOLS - Type Definitions for Claude Tool Use
// =====================================================

/**
 * Tool parameter definition (JSON Schema compatible)
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: ToolParameter
  default?: unknown
  properties?: Record<string, ToolParameter>
  required?: string[]
}

/**
 * Tool definition compatible with Claude tool use
 */
export interface ExoTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
}

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  tenant_id: string
  user_id?: string
  conversation_id?: string
}

/**
 * Result returned from tool execution
 */
export interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  context: ToolContext,
  params: Record<string, unknown>
) => Promise<ToolResult>

/**
 * Tool registration entry in the registry
 */
export interface ToolRegistration {
  definition: ExoTool
  handler: ToolHandler
  requires_rig?: string[] // Optional rig requirement (at least one must be connected)
  category?: 'communication' | 'productivity' | 'search' | 'health' | 'finance'
}

/**
 * Tool execution request (from API)
 */
export interface ToolExecutionRequest {
  tool: string
  tenant_id: string
  params?: Record<string, unknown>
  conversation_id?: string
}

/**
 * Tool execution response (to API)
 */
export interface ToolExecutionResponse {
  success: boolean
  tool: string
  result?: unknown
  error?: string
  execution_time_ms?: number
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Create a string parameter
 */
export function stringParam(description: string, options?: { enum?: string[], default?: string }): ToolParameter {
  return {
    type: 'string',
    description,
    ...(options?.enum && { enum: options.enum }),
    ...(options?.default !== undefined && { default: options.default }),
  }
}

/**
 * Create a number parameter
 */
export function numberParam(description: string, options?: { default?: number }): ToolParameter {
  return {
    type: 'number',
    description,
    ...(options?.default !== undefined && { default: options.default }),
  }
}

/**
 * Create a boolean parameter
 */
export function booleanParam(description: string, options?: { default?: boolean }): ToolParameter {
  return {
    type: 'boolean',
    description,
    ...(options?.default !== undefined && { default: options.default }),
  }
}

/**
 * Create an array parameter
 */
export function arrayParam(description: string, itemType: ToolParameter): ToolParameter {
  return {
    type: 'array',
    description,
    items: itemType,
  }
}
