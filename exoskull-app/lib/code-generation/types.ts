/**
 * Code Generation Types
 * Phase 2: Multi-model code generation system
 */

export type CodeModel = "claude-code" | "kimi-code" | "gpt-o1-code";

export type TaskComplexity =
  | "simple"
  | "moderate"
  | "complex"
  | "deep_reasoning";

export interface CodeGenerationTask {
  description: string;
  context: {
    repoSize?: number; // Total lines of code
    fileCount?: number;
    existingFiles?: string[];
    dependencies?: string[];
  };
  requirements: string[];
  expectedOutput: {
    fileCount: number;
    estimatedLines: number;
    requiresGit?: boolean;
    requiresDeployment?: boolean;
  };
  tenantId: string;
}

export interface CodeGenerationResult {
  success: boolean;
  model: CodeModel;
  files: Array<{
    path: string;
    content: string;
    operation: "create" | "modify" | "delete";
  }>;
  gitCommit?: {
    hash: string;
    message: string;
  };
  deploymentUrl?: string;
  duration: number;
  error?: string;
}

export interface CodeExecutor {
  // Metadata
  model: CodeModel;
  capabilities: {
    maxContextTokens: number;
    supportsMultiFile: boolean;
    supportsGitOps: boolean;
    supportsDeploy: boolean;
  };

  // Core methods
  execute(task: CodeGenerationTask): Promise<CodeGenerationResult>;
  health(): Promise<"healthy" | "degraded" | "down">;
  stop(): Promise<void>;
}

export interface TaskClassification {
  complexity: TaskComplexity;
  requiresReasoning: "basic" | "moderate" | "deep";
  estimatedTokens: number;
  type:
    | "code_generation"
    | "refactor"
    | "debug"
    | "architecture"
    | "optimization";
}
