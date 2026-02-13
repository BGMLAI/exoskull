/**
 * Code Generation IORS Tools
 * Phase 2: Full-stack app generation, code modification, testing, deployment
 *
 * Tools:
 * - generate_fullstack_app: Multi-file app generation (React + API + DB)
 * - modify_code: Edit existing code files via AI
 * - run_tests: AI-generated test analysis (no Docker execution)
 * - deploy_app: Deploy to Vercel or return manual instructions
 */

import type { ToolDefinition } from "./index";
import type { CodeGenerationTask } from "@/lib/code-generation/types";
import { executeCodeGeneration } from "@/lib/code-generation/executor";
import {
  isVPSAvailable,
  executeOnVPS,
  runTestsOnVPS,
  formatVPSResult,
} from "@/lib/code-generation/vps-executor";

/** All code-gen tools need 55s (Vercel Hobby has 60s limit) */
const CODE_GEN_TIMEOUT = 55_000;

export const codeGenerationTools: ToolDefinition[] = [
  {
    timeoutMs: CODE_GEN_TIMEOUT,
    definition: {
      name: "generate_fullstack_app",
      description: `Generate a complete full-stack application with multiple files (React components, API routes, database migrations, tests).

Use this when the user asks to build a complex app that requires multiple files and backend logic.
Examples: "Build an e-commerce site with Stripe", "Create a habit tracker with charts", "Build a blog with authentication".

This is different from the simple Canvas app builder (build_app) which only creates single-table CRUD widgets.`,
      input_schema: {
        type: "object" as const,
        properties: {
          description: {
            type: "string",
            description: "Detailed description of the application to build",
          },
          features: {
            type: "array",
            items: { type: "string" },
            description: "List of required features",
          },
          tech_stack: {
            type: "string",
            description:
              "Technology stack to use (default: Next.js, Supabase, TailwindCSS)",
          },
        },
        required: ["description", "features"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const description = input.description as string;
      const features = input.features as string[];
      const techStack =
        (input.tech_stack as string) || "Next.js, Supabase, TailwindCSS";

      const task: CodeGenerationTask = {
        description,
        context: {
          repoSize: 0,
          fileCount: 0,
          dependencies: [
            "next",
            "react",
            "@supabase/supabase-js",
            "tailwindcss",
          ],
        },
        requirements: features,
        expectedOutput: {
          fileCount: 10,
          estimatedLines: 500,
          requiresGit: false,
          requiresDeployment: false,
        },
        tenantId,
      };

      console.log("[CodeGenTools] Generating full-stack app:", {
        tenantId,
        description: description.slice(0, 80),
        features: features.length,
        techStack,
      });

      const result = await executeCodeGeneration(task);

      if (!result.success) {
        console.error("[CodeGenTools] Generation failed:", {
          tenantId,
          error: result.error,
          model: result.model,
        });
        return `Nie udalo sie wygenerowac aplikacji: ${result.error || "Nieznany blad"}`;
      }

      // Store workspace + files in DB (server-side — use service client)
      try {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const workspaceId = `ws-${tenantId.slice(0, 8)}-${Date.now()}`;

        await supabase.from("exo_code_workspaces").insert({
          id: workspaceId,
          tenant_id: tenantId,
          name: description.substring(0, 100),
          description,
          model_used: result.model,
          tech_stack: techStack,
          features: features,
          status: "generated",
          total_files: result.files.length,
          generation_duration_ms: result.duration,
        });

        // Batch insert files
        const fileRows = result.files.map((file) => ({
          workspace_id: workspaceId,
          tenant_id: tenantId,
          file_path: file.path,
          content: file.content,
          language: file.language || null,
          operation: file.operation || "create",
          version: 1,
          line_count: file.content.split("\n").length,
        }));

        if (fileRows.length > 0) {
          const { error: filesError } = await supabase
            .from("exo_generated_files")
            .insert(fileRows);
          if (filesError) {
            console.warn(
              "[CodeGenTools] File insert warning:",
              filesError.message,
            );
          }
        }

        let response = `Wygenerowano aplikacje "${description}" (${result.files.length} plikow)\n\n`;
        response += `Workspace: ${workspaceId}\n`;
        response += `Model: ${result.model}\n`;
        response += `Czas: ${result.duration}ms\n\n`;
        if (result.summary) {
          response += `Podsumowanie: ${result.summary}\n\n`;
        }
        response += `Pliki:\n`;
        for (const file of result.files) {
          response += `  - ${file.path} (${file.language || "unknown"})\n`;
        }
        if (result.dependencies && result.dependencies.length > 0) {
          response += `\nZaleznosci: ${result.dependencies.join(", ")}\n`;
        }
        response += `\nMozesz uzyc modify_code aby zmienic pliki, run_tests aby sprawdzic, lub deploy_app aby wdrozyc.`;

        return response;
      } catch (dbError) {
        console.error("[CodeGenTools] DB save failed:", {
          tenantId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
        // Still return the generation result even if DB save fails
        let response = `Wygenerowano aplikacje "${description}" (${result.files.length} plikow)\n`;
        response += `Model: ${result.model}, Czas: ${result.duration}ms\n`;
        response += `UWAGA: Nie udalo sie zapisac do bazy danych.\n\n`;
        response += `Pliki:\n`;
        for (const file of result.files.slice(0, 10)) {
          response += `  - ${file.path}\n`;
        }
        return response;
      }
    },
  },

  {
    timeoutMs: CODE_GEN_TIMEOUT,
    definition: {
      name: "modify_code",
      description: `Modify existing code files in a workspace using AI.

Use this when the user wants to change existing code.
Examples: "Add error handling to the login function", "Refactor the database query", "Update the API endpoint".`,
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "Workspace ID (from generate_fullstack_app)",
          },
          file_path: {
            type: "string",
            description: "Path to the file to modify",
          },
          instruction: {
            type: "string",
            description: "What to change",
          },
        },
        required: ["workspace_id", "file_path", "instruction"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const workspaceId = input.workspace_id as string;
      const filePath = input.file_path as string;
      const instruction = input.instruction as string;

      console.log("[CodeGenTools] Modifying code:", {
        tenantId,
        workspaceId,
        filePath,
        instruction: instruction.slice(0, 80),
      });

      try {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();

        // Load the latest version of the file
        const { data: existingFile, error: fetchError } = await supabase
          .from("exo_generated_files")
          .select("id, content, version, language")
          .eq("workspace_id", workspaceId)
          .eq("tenant_id", tenantId)
          .eq("file_path", filePath)
          .order("version", { ascending: false })
          .limit(1)
          .single();

        if (fetchError || !existingFile) {
          return `Nie znaleziono pliku ${filePath} w workspace ${workspaceId}. Sprawdz sciezke.`;
        }

        // Use AI to modify the file
        const { buildModifyPrompt } =
          await import("@/lib/code-generation/prompts/code-gen-prompt");
        const { parseModifyResponse } =
          await import("@/lib/code-generation/response-parser");
        const { aiChat } = await import("@/lib/ai");

        const response = await aiChat(
          [
            {
              role: "user",
              content: buildModifyPrompt(
                filePath,
                existingFile.content,
                instruction,
              ),
            },
          ],
          {
            forceModel: "claude-sonnet-4-5",
            maxTokens: 8192,
            tenantId,
            taskCategory: "analysis",
          },
        );

        const parsed = parseModifyResponse(response.content);
        if (!parsed || !parsed.content) {
          return `Nie udalo sie zmodyfikowac pliku. AI nie zwrocilo poprawnej odpowiedzi.`;
        }

        // Insert new version (preserving previous)
        const newVersion = (existingFile.version || 1) + 1;
        const { error: insertError } = await supabase
          .from("exo_generated_files")
          .insert({
            workspace_id: workspaceId,
            tenant_id: tenantId,
            file_path: filePath,
            content: parsed.content,
            language: existingFile.language,
            operation: "modify",
            version: newVersion,
            previous_content: existingFile.content,
            line_count: parsed.content.split("\n").length,
          });

        if (insertError) {
          console.error(
            "[CodeGenTools] Modify save failed:",
            insertError.message,
          );
          return `Zmodyfikowano plik, ale nie udalo sie zapisac: ${insertError.message}`;
        }

        let result = `Zmodyfikowano ${filePath} (v${newVersion})\n\n`;
        result += `Instrukcja: ${instruction}\n`;
        if (parsed.summary) {
          result += `Zmiany: ${parsed.summary}\n`;
        }
        result += `Linie: ${parsed.content.split("\n").length}\n`;

        return result;
      } catch (error) {
        console.error("[CodeGenTools] modify_code failed:", {
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        return `Blad modyfikacji: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  {
    timeoutMs: CODE_GEN_TIMEOUT,
    definition: {
      name: "run_tests",
      description: `Run tests and analyze code quality for a workspace.

If VPS executor is available, tests run in a real Docker sandbox (npm test, typecheck, lint).
Otherwise falls back to AI-based code review.
Examples: "Run tests for the habit tracker", "Test the API endpoints".`,
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "Workspace ID",
          },
        },
        required: ["workspace_id"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const workspaceId = input.workspace_id as string;

      console.log("[CodeGenTools] Running test analysis:", {
        tenantId,
        workspaceId,
      });

      try {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();

        // Load all files from workspace (latest versions only)
        const { data: files, error: fetchError } = await supabase
          .from("exo_generated_files")
          .select("file_path, content, language, version")
          .eq("workspace_id", workspaceId)
          .eq("tenant_id", tenantId)
          .order("version", { ascending: false });

        if (fetchError || !files || files.length === 0) {
          return `Workspace ${workspaceId} nie zawiera plikow lub nie istnieje.`;
        }

        // Deduplicate to latest version per file
        const latestFiles = new Map<string, (typeof files)[0]>();
        for (const f of files) {
          if (!latestFiles.has(f.file_path)) {
            latestFiles.set(f.file_path, f);
          }
        }

        // Try VPS execution first (real Docker sandbox)
        const vpsAvailable = await isVPSAvailable();
        if (vpsAvailable) {
          console.log("[CodeGenTools] VPS available — running real tests");
          const vpsFiles = Array.from(latestFiles.values()).map((f) => ({
            path: f.file_path,
            content: f.content,
          }));

          const vpsResult = await runTestsOnVPS(workspaceId, vpsFiles);

          // Update workspace status
          const status = vpsResult.success ? "vps_tested" : "test_failed";
          await supabase
            .from("exo_code_workspaces")
            .update({ status })
            .eq("id", workspaceId)
            .eq("tenant_id", tenantId);

          let result = `Testy (Docker sandbox) dla workspace ${workspaceId}\n`;
          result += `Plikow: ${latestFiles.size}\n\n`;
          result += formatVPSResult(vpsResult);
          return result;
        }

        // Fallback: AI-based analysis (no VPS)
        console.log("[CodeGenTools] VPS not available — using AI analysis");

        const codeSummary = Array.from(latestFiles.values())
          .map(
            (f) =>
              `### ${f.file_path} (${f.language || "unknown"})\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``,
          )
          .join("\n\n");

        const { aiChat } = await import("@/lib/ai");
        const response = await aiChat(
          [
            {
              role: "user",
              content: `Analyze the following code files and generate a test report. For each file, identify:
1. Potential bugs or issues
2. Missing error handling
3. Security concerns
4. Test cases that should exist (with expected pass/fail)
5. Overall code quality score (1-10)

Be specific and actionable. Respond in Polish.

${codeSummary}`,
            },
          ],
          {
            forceModel: "claude-sonnet-4-5",
            maxTokens: 4096,
            tenantId,
            taskCategory: "analysis",
          },
        );

        let result = `Analiza testow (AI) dla workspace ${workspaceId}\n`;
        result += `Przeanalizowano ${latestFiles.size} plikow\n`;
        result += `(VPS niedostepny — analiza AI zamiast prawdziwych testow)\n\n`;
        result += response.content;

        // Update workspace status
        await supabase
          .from("exo_code_workspaces")
          .update({ status: "tested" })
          .eq("id", workspaceId)
          .eq("tenant_id", tenantId);

        return result;
      } catch (error) {
        console.error("[CodeGenTools] run_tests failed:", {
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        return `Blad analizy testow: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  {
    timeoutMs: CODE_GEN_TIMEOUT,
    definition: {
      name: "deploy_app",
      description: `Deploy a workspace to production. Uses Vercel API if VERCEL_TOKEN is available, otherwise provides manual deployment instructions.

Examples: "Deploy the habit tracker", "Push to production".`,
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "Workspace ID",
          },
          platform: {
            type: "string",
            enum: ["vercel", "vps", "manual"],
            description:
              "Deployment platform (vercel, vps for Docker deploy, or manual instructions)",
          },
        },
        required: ["workspace_id"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const workspaceId = input.workspace_id as string;
      const platform = (input.platform as string) || "vercel";

      console.log("[CodeGenTools] Deploying workspace:", {
        tenantId,
        workspaceId,
        platform,
      });

      try {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();

        // Load workspace + files
        const { data: workspace, error: wsError } = await supabase
          .from("exo_code_workspaces")
          .select("*")
          .eq("id", workspaceId)
          .eq("tenant_id", tenantId)
          .single();

        if (wsError || !workspace) {
          return `Workspace ${workspaceId} nie istnieje lub nie masz dostepu.`;
        }

        const { data: files } = await supabase
          .from("exo_generated_files")
          .select("file_path, content")
          .eq("workspace_id", workspaceId)
          .eq("tenant_id", tenantId)
          .order("version", { ascending: false });

        if (!files || files.length === 0) {
          return `Workspace ${workspaceId} nie zawiera plikow.`;
        }

        // Deduplicate to latest version
        const latestFiles = new Map<string, string>();
        for (const f of files) {
          if (!latestFiles.has(f.file_path)) {
            latestFiles.set(f.file_path, f.content);
          }
        }

        // Try VPS deploy
        if (platform === "vps") {
          const vpsAvailable = await isVPSAvailable();
          if (!vpsAvailable) {
            return "VPS executor niedostepny. Sprawdz VPS_EXECUTOR_URL i VPS_EXECUTOR_SECRET w .env, lub uzyj platform=vercel.";
          }

          const vpsFiles = Array.from(latestFiles.entries()).map(
            ([path, content]) => ({ path, content }),
          );

          // First: build
          const buildResult = await executeOnVPS({
            workspace_id: workspaceId,
            action: "build",
            runtime: "node",
            files: vpsFiles,
            timeout_ms: 180_000, // 3min for build
            network: true,
          });

          if (!buildResult.success) {
            return `Build nie powiodl sie:\n${formatVPSResult(buildResult)}`;
          }

          // Update workspace
          await supabase
            .from("exo_code_workspaces")
            .update({
              status: "vps_deployed",
              deployment_url: `vps://${workspaceId}`,
            })
            .eq("id", workspaceId)
            .eq("tenant_id", tenantId);

          let result = `Zbudowano na VPS: workspace ${workspaceId}\n\n`;
          result += formatVPSResult(buildResult);
          return result;
        }

        const vercelToken = process.env.VERCEL_TOKEN;

        if (platform === "vercel" && vercelToken) {
          // Deploy via Vercel API
          try {
            const fileEntries = Array.from(latestFiles.entries()).map(
              ([path, content]) => ({
                file: path,
                data: content,
              }),
            );

            const deployRes = await fetch(
              "https://api.vercel.com/v13/deployments",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${vercelToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: workspaceId,
                  files: fileEntries,
                  projectSettings: {
                    framework: "nextjs",
                  },
                }),
                signal: AbortSignal.timeout(30000),
              },
            );

            if (!deployRes.ok) {
              const errBody = await deployRes.text();
              console.error("[CodeGenTools] Vercel deploy failed:", errBody);
              return `Vercel deployment failed: ${deployRes.status}. Sprobuj ponownie lub uzyj "manual".`;
            }

            const deployData = await deployRes.json();
            const deploymentUrl = deployData.url
              ? `https://${deployData.url}`
              : null;

            // Update workspace
            await supabase
              .from("exo_code_workspaces")
              .update({
                status: "deployed",
                deployment_url: deploymentUrl,
              })
              .eq("id", workspaceId)
              .eq("tenant_id", tenantId);

            let result = `Wdrozono workspace ${workspaceId} na Vercel\n\n`;
            if (deploymentUrl) {
              result += `URL: ${deploymentUrl}\n`;
            }
            result += `Pliki: ${latestFiles.size}\n`;
            result += `Status: deployed\n`;

            return result;
          } catch (deployError) {
            console.error("[CodeGenTools] Vercel API error:", {
              error:
                deployError instanceof Error
                  ? deployError.message
                  : String(deployError),
            });
            return `Blad Vercel API: ${deployError instanceof Error ? deployError.message : String(deployError)}. Sprobuj platform=manual.`;
          }
        }

        // Manual deployment instructions
        let result = `Instrukcje wdrozenia dla workspace ${workspaceId}\n\n`;
        result += `Pliki (${latestFiles.size}):\n`;
        for (const [path] of latestFiles) {
          result += `  - ${path}\n`;
        }
        result += `\nKroki:\n`;
        result += `1. Utworz nowy projekt: npx create-next-app@latest ${workspaceId}\n`;
        result += `2. Skopiuj wygenerowane pliki do projektu\n`;
        result += `3. Zainstaluj zaleznosci: npm install\n`;
        result += `4. Uruchom lokalnie: npm run dev\n`;
        result += `5. Deploy: vercel --prod\n`;

        if (!vercelToken) {
          result += `\nUWAGA: VERCEL_TOKEN nie jest skonfigurowany. Dodaj go do .env aby umozliwic automatyczny deploy.`;
        }

        // Update workspace status
        await supabase
          .from("exo_code_workspaces")
          .update({ status: "ready_to_deploy" })
          .eq("id", workspaceId)
          .eq("tenant_id", tenantId);

        return result;
      } catch (error) {
        console.error("[CodeGenTools] deploy_app failed:", {
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        return `Blad wdrozenia: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  {
    timeoutMs: 120_000, // 2min for VPS execution
    definition: {
      name: "execute_code",
      description: `Execute code in a secure Docker sandbox on the VPS.

Run scripts, test snippets, or execute programs in isolated containers.
Supports Node.js and Python runtimes.
Examples: "Run this Python script", "Execute the data processing pipeline", "Test this function".

Requires VPS executor to be configured (VPS_EXECUTOR_URL).`,
      input_schema: {
        type: "object" as const,
        properties: {
          code: {
            type: "string",
            description: "Code to execute",
          },
          filename: {
            type: "string",
            description: "Filename for the code (e.g., 'main.py', 'script.ts')",
          },
          runtime: {
            type: "string",
            enum: ["node", "python"],
            description: "Runtime environment (default: node)",
          },
          command: {
            type: "string",
            description: "Custom command to run (overrides default)",
          },
          additional_files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
              required: ["path", "content"],
            },
            description:
              "Additional files needed (e.g., package.json, requirements.txt)",
          },
        },
        required: ["code", "filename"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const code = input.code as string;
      const filename = input.filename as string;
      const runtime = (input.runtime as "node" | "python") || "node";
      const command = input.command as string | undefined;
      const additionalFiles =
        (input.additional_files as Array<{ path: string; content: string }>) ||
        [];

      console.log("[CodeGenTools] execute_code:", {
        tenantId,
        filename,
        runtime,
        codeLength: code.length,
      });

      const vpsAvailable = await isVPSAvailable();
      if (!vpsAvailable) {
        return "VPS executor niedostepny. Nie mozna uruchomic kodu. Skonfiguruj VPS_EXECUTOR_URL i VPS_EXECUTOR_SECRET w .env.";
      }

      const files = [{ path: filename, content: code }, ...additionalFiles];

      const result = await executeOnVPS({
        action: "run",
        runtime,
        files,
        entrypoint: filename,
        command,
        timeout_ms: 60_000,
        network: false, // Sandbox: no outbound network by default
      });

      return formatVPSResult(result);
    },
  },
];
