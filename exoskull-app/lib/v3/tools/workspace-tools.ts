/**
 * Shared Workspace Tools — V3 agent tools for workspace control
 *
 * Tools:
 * - open_workspace: Open URL or content in shared workspace panel
 * - workspace_action: Execute browser action (navigate, click, type, etc.)
 * - workspace_terminal: Run terminal command in workspace
 * - show_in_workspace: Display AI-generated content (dashboard, visualization, document)
 */

import type { V3ToolDefinition } from "./index";
import { logger } from "@/lib/logger";

// ============================================================================
// #1 open_workspace — Open URL or start workspace session
// ============================================================================

const openWorkspaceTool: V3ToolDefinition = {
  definition: {
    name: "open_workspace",
    description:
      "Otwórz URL w Shared Workspace (wirtualna przeglądarka). User widzi stronę w panelu obok czatu. Użyj do pokazania stron, dokumentów, dashboardów.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL do otwarcia w workspace",
        },
        title: {
          type: "string",
          description: "Tytuł panelu (opcjonalny)",
        },
      },
      required: ["url"],
    },
  },
  timeoutMs: 30_000,
  async execute(input, tenantId) {
    try {
      const { getOrCreateSession, executeBrowserAction, addPanel } =
        await import("@/lib/workspace/workspace-engine");

      const session = await getOrCreateSession(tenantId);
      const url = input.url as string;
      const title = (input.title as string) || url;

      // Try to navigate browser
      try {
        const result = await executeBrowserAction(session.id, tenantId, {
          type: "navigate",
          target: url,
        });

        if (result.success) {
          return `Otworzyłem "${result.title || url}" w Shared Workspace. ${result.screenshot_url ? "Screenshot dostępny." : ""}`;
        }
      } catch {
        // VPS not available — fall back to panel mode
      }

      // Fallback: add as link preview panel (no VPS needed)
      await addPanel(session.id, tenantId, {
        panel_type: "link_preview",
        title,
        content: null,
        url,
        position: { x: 0, y: 0, w: 12, h: 8 },
      });

      return `Dodałem "${title}" jako panel w Shared Workspace. URL: ${url}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("[WorkspaceTool] open_workspace failed:", { error: msg });
      return `Błąd otwierania workspace: ${msg}`;
    }
  },
};

// ============================================================================
// #2 workspace_action — Execute browser action
// ============================================================================

const workspaceActionTool: V3ToolDefinition = {
  definition: {
    name: "workspace_action",
    description:
      "Wykonaj akcję w wirtualnej przeglądarce workspace: kliknij element, wpisz tekst, scrolluj, zrób screenshot. Użyj po open_workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: [
            "click",
            "type",
            "scroll",
            "screenshot",
            "evaluate",
            "back",
            "forward",
            "refresh",
          ],
          description: "Typ akcji do wykonania",
        },
        target: {
          type: "string",
          description:
            "CSS selector elementu (dla click/type) lub JavaScript (dla evaluate)",
        },
        value: {
          type: "string",
          description:
            "Tekst do wpisania (dla type) lub JS do wykonania (dla evaluate)",
        },
      },
      required: ["action"],
    },
  },
  timeoutMs: 30_000,
  async execute(input, tenantId) {
    try {
      const { getOrCreateSession, executeBrowserAction } =
        await import("@/lib/workspace/workspace-engine");

      const session = await getOrCreateSession(tenantId);
      const result = await executeBrowserAction(session.id, tenantId, {
        type: input.action as
          | "click"
          | "type"
          | "scroll"
          | "screenshot"
          | "evaluate"
          | "back"
          | "forward"
          | "refresh",
        target: input.target as string | undefined,
        value: input.value as string | undefined,
      });

      if (!result.success) {
        return `Akcja "${input.action}" nie powiodła się: ${result.error}`;
      }

      const parts: string[] = [`Wykonano: ${input.action}`];
      if (result.url) parts.push(`URL: ${result.url}`);
      if (result.title) parts.push(`Tytuł: ${result.title}`);
      if (result.screenshot_url) parts.push("Screenshot zaktualizowany.");
      if (result.content) parts.push(`Wynik: ${result.content.slice(0, 500)}`);

      return parts.join("\n");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Błąd workspace action: ${msg}`;
    }
  },
};

// ============================================================================
// #3 workspace_terminal — Run command in workspace terminal
// ============================================================================

const workspaceTerminalTool: V3ToolDefinition = {
  definition: {
    name: "workspace_terminal",
    description:
      "Uruchom komendę w terminalu VPS workspace. Użyj do: instalowania paczek, uruchamiania skryptów, sprawdzania statusu, budowania projektów.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Komenda do uruchomienia (bash)",
        },
      },
      required: ["command"],
    },
  },
  timeoutMs: 35_000,
  async execute(input, tenantId) {
    try {
      const { getOrCreateSession, executeTerminal } =
        await import("@/lib/workspace/workspace-engine");

      const session = await getOrCreateSession(tenantId);
      const result = await executeTerminal(
        session.id,
        tenantId,
        input.command as string,
      );

      return `Exit code: ${result.exitCode}\n${result.output.slice(0, 2000)}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Błąd terminala: ${msg}`;
    }
  },
};

// ============================================================================
// #4 show_in_workspace — Display AI-generated content in workspace
// ============================================================================

const showInWorkspaceTool: V3ToolDefinition = {
  definition: {
    name: "show_in_workspace",
    description:
      "Pokaż treść w Shared Workspace: dashboard, wizualizację, dokument, kod, podgląd pliku. AI generuje HTML/Markdown/kod i wyświetla w panelu workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Tytuł panelu",
        },
        content: {
          type: "string",
          description:
            "Treść do wyświetlenia (HTML, Markdown, kod). Dla dashboardów użyj pełnego HTML z CSS.",
        },
        panel_type: {
          type: "string",
          enum: [
            "dashboard",
            "visualization",
            "document",
            "code",
            "file_preview",
            "custom",
          ],
          description: "Typ panelu (default: custom)",
        },
      },
      required: ["title", "content"],
    },
  },
  timeoutMs: 10_000,
  async execute(input, tenantId) {
    try {
      const { getOrCreateSession, addPanel } =
        await import("@/lib/workspace/workspace-engine");

      const session = await getOrCreateSession(tenantId);

      const panel = await addPanel(session.id, tenantId, {
        panel_type: (input.panel_type as string) || "custom",
        title: input.title as string,
        content: input.content as string,
        url: null,
        position: { x: 0, y: 0, w: 12, h: 8 },
      });

      return `Panel "${input.title}" dodany do Shared Workspace (${panel.id}). User widzi treść w panelu obok czatu.`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Błąd wyświetlania w workspace: ${msg}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const workspaceTools: V3ToolDefinition[] = [
  openWorkspaceTool,
  workspaceActionTool,
  workspaceTerminalTool,
  showInWorkspaceTool,
];
