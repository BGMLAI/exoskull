/**
 * ATLAS Pipeline
 *
 * Automated workflow for building applications within ExoSkull.
 * A - Architect: Define problem, users, success metrics
 * T - Trace: Data schema, integrations, tech stack
 * L - Link: Validate ALL connections before building
 * A - Assemble: Build (database → backend → frontend)
 * S - Stress-test: Test functionality, edge cases, user acceptance
 *
 * Each stage is executed by a specialized agent and produces artifacts
 * that feed into the next stage.
 */

import { aiChat } from "@/lib/ai";
import { emitSystemEvent } from "@/lib/system/events";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPES
// ============================================================================

export type ATLASStage =
  | "architect"
  | "trace"
  | "link"
  | "assemble"
  | "stress_test";

export interface ATLASPipelineState {
  id: string;
  tenantId: string;
  appDescription: string;
  currentStage: ATLASStage;
  stages: Record<ATLASStage, StageResult>;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface StageResult {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: string;
  artifacts?: Record<string, unknown>;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ============================================================================
// STAGE PROMPTS
// ============================================================================

const STAGE_PROMPTS: Record<ATLASStage, string> = {
  architect: `You are the ARCHITECT stage of the ATLAS pipeline. Your job:
1. Define the problem clearly
2. Identify target users
3. List success metrics (measurable)
4. Define core features (MVP — minimum viable)
5. Choose architecture pattern

Output JSON:
{
  "problem": "...",
  "users": ["..."],
  "metrics": ["..."],
  "features": [{ "name": "...", "priority": "must|should|nice" }],
  "architecture": "...",
  "techStack": { "frontend": "...", "backend": "...", "database": "...", "hosting": "..." }
}`,

  trace: `You are the TRACE stage of the ATLAS pipeline. Given the architecture:
1. Design the database schema (tables, columns, types, relations)
2. Define API endpoints (REST/GraphQL)
3. List external integrations needed
4. Map data flows (input → processing → output)

Output JSON:
{
  "schema": [{ "table": "...", "columns": [...], "relations": [...] }],
  "endpoints": [{ "method": "...", "path": "...", "description": "..." }],
  "integrations": ["..."],
  "dataFlows": [{ "from": "...", "to": "...", "via": "..." }]
}`,

  link: `You are the LINK stage of the ATLAS pipeline. Validate:
1. All database tables referenced in API exist in schema
2. All integrations have credentials configured
3. All data flows are complete (no dead ends)
4. Tech stack versions are compatible
5. Environment variables are documented

Output JSON:
{
  "valid": boolean,
  "checks": [{ "name": "...", "passed": boolean, "details": "..." }],
  "missing": ["..."],
  "warnings": ["..."]
}`,

  assemble: `You are the ASSEMBLE stage of the ATLAS pipeline. Build the app:
1. Database migration SQL
2. API route handlers (Next.js App Router)
3. Frontend components (React + Tailwind)
4. State management (Zustand if needed)
5. Type definitions

Order: database → types → backend → frontend

Output JSON:
{
  "files": [{ "path": "...", "content": "...", "language": "..." }],
  "dependencies": ["..."],
  "envVars": ["..."],
  "deploySteps": ["..."]
}`,

  stress_test: `You are the STRESS-TEST stage of the ATLAS pipeline. Test:
1. API endpoint responses (expected status codes, data shapes)
2. Edge cases (empty data, large payloads, concurrent requests)
3. Error handling (invalid input, network failure)
4. User acceptance criteria (from architect stage)
5. Performance considerations

Output JSON:
{
  "tests": [{ "name": "...", "type": "unit|integration|e2e", "passed": boolean, "details": "..." }],
  "issues": [{ "severity": "critical|major|minor", "description": "...", "fix": "..." }],
  "metrics": { "responseTimeMs": ..., "errorRate": ... },
  "readyForDeploy": boolean
}`,
};

const STAGE_ORDER: ATLASStage[] = [
  "architect",
  "trace",
  "link",
  "assemble",
  "stress_test",
];

// ============================================================================
// PIPELINE MANAGEMENT
// ============================================================================

const activePipelines = new Map<string, ATLASPipelineState>();

/**
 * Start an ATLAS pipeline for building an app
 */
export function startPipeline(
  tenantId: string,
  appDescription: string,
): ATLASPipelineState {
  const id = `atlas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const emptyStage = (): StageResult => ({ status: "pending" });

  const state: ATLASPipelineState = {
    id,
    tenantId,
    appDescription,
    currentStage: "architect",
    stages: {
      architect: emptyStage(),
      trace: emptyStage(),
      link: emptyStage(),
      assemble: emptyStage(),
      stress_test: emptyStage(),
    },
    status: "running",
    startedAt: Date.now(),
  };

  activePipelines.set(id, state);
  return state;
}

/**
 * Execute the next stage of the pipeline
 */
export async function executeNextStage(pipelineId: string): Promise<{
  done: boolean;
  stage: ATLASStage;
  result: string;
}> {
  const pipeline = activePipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);

  const stage = pipeline.currentStage;
  const stageResult = pipeline.stages[stage];
  stageResult.status = "running";
  stageResult.startedAt = Date.now();

  // Build context from previous stages
  const previousContext = STAGE_ORDER.filter(
    (s) => STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage),
  )
    .map((s) => {
      const r = pipeline.stages[s];
      return r.output ? `## ${s.toUpperCase()} output:\n${r.output}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const prompt = `App description: ${pipeline.appDescription}\n\n${previousContext}\n\nExecute the ${stage.toUpperCase()} stage.`;

  try {
    // Use Sonnet for assemble (code generation), Opus for architect/trace, Haiku for link/stress_test
    const model =
      stage === "assemble"
        ? "claude-sonnet-4-5"
        : stage === "architect" || stage === "trace"
          ? "claude-opus-4-5"
          : "claude-3-5-haiku";

    const result = await aiChat(
      [
        { role: "system", content: STAGE_PROMPTS[stage] },
        { role: "user", content: prompt },
      ],
      {
        forceModel: model as "claude-sonnet-4-5",
        maxTokens: stage === "assemble" ? 16000 : 4000,
      },
    );

    stageResult.status = "completed";
    stageResult.output = result.content || "";
    stageResult.completedAt = Date.now();

    // Parse artifacts
    try {
      const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        stageResult.artifacts = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Non-JSON output is fine
    }

    // Advance to next stage
    const currentIdx = STAGE_ORDER.indexOf(stage);
    if (currentIdx < STAGE_ORDER.length - 1) {
      pipeline.currentStage = STAGE_ORDER[currentIdx + 1];
    } else {
      pipeline.status = "completed";
      pipeline.completedAt = Date.now();
    }

    emitSystemEvent({
      tenantId: pipeline.tenantId,
      eventType: "build_completed",
      component: "atlas_pipeline",
      severity: "info",
      message: `ATLAS ${stage}: completed`,
      details: { pipelineId, stage },
    });

    return {
      done: pipeline.status === "completed",
      stage,
      result: result.content?.slice(0, 500) || "",
    };
  } catch (err) {
    stageResult.status = "failed";
    stageResult.error = err instanceof Error ? err.message : String(err);
    pipeline.status = "failed";
    pipeline.error = stageResult.error;

    return {
      done: true,
      stage,
      result: `FAILED: ${stageResult.error}`,
    };
  }
}

/**
 * Run the full pipeline end-to-end
 */
export async function runFullPipeline(
  tenantId: string,
  appDescription: string,
): Promise<ATLASPipelineState> {
  const pipeline = startPipeline(tenantId, appDescription);

  for (const stage of STAGE_ORDER) {
    if (pipeline.status === "failed") break;
    pipeline.currentStage = stage;
    await executeNextStage(pipeline.id);
  }

  // Persist results
  const supabase = getServiceSupabase();
  await supabase.from("exo_dev_journal").insert({
    tenant_id: tenantId,
    entry_type: "atlas_pipeline",
    title: `ATLAS: ${appDescription.slice(0, 100)}`,
    content: JSON.stringify({
      stages: Object.fromEntries(
        STAGE_ORDER.map((s) => [
          s,
          {
            status: pipeline.stages[s].status,
            output: pipeline.stages[s].output?.slice(0, 1000),
          },
        ]),
      ),
      status: pipeline.status,
      duration: (pipeline.completedAt || Date.now()) - pipeline.startedAt,
    }),
    metadata: { pipelineId: pipeline.id },
  });

  return pipeline;
}

/**
 * Get pipeline status
 */
export function getPipelineStatus(
  pipelineId: string,
): ATLASPipelineState | null {
  return activePipelines.get(pipelineId) || null;
}
