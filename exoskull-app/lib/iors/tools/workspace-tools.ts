/**
 * Workspace Control IORS Tools
 *
 * Allows IORS to control the shared workspace panel:
 * - Open files in code view
 * - Show HTML preview
 * - Switch tabs
 * - Run terminal commands
 * - Show diffs
 *
 * Uses the __SSE__ directive pattern (same as dashboard-tools.ts)
 * to send workspace_update events to the frontend.
 */

import type { ToolDefinition } from "./shared";

// ---------------------------------------------------------------------------
// SSE directive helper (same pattern as dashboard-tools.ts)
// ---------------------------------------------------------------------------

function encodeSSEDirective(
  sseType: string,
  sseData: Record<string, unknown>,
  humanResult: string,
): string {
  return `__SSE__${JSON.stringify({ type: sseType, ...sseData })}__SSE__${humanResult}`;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  "open_file",
  "show_preview",
  "switch_tab",
  "show_diff",
] as const;

const VALID_TABS = ["terminal", "files", "code", "preview"] as const;

export const workspaceTools: ToolDefinition[] = [
  {
    timeoutMs: 5_000,
    definition: {
      name: "workspace_control",
      description: `Kontroluj workspace panel użytkownika. Dostępne akcje:
- open_file: otwórz plik w edytorze kodu (podaj file_path)
- show_preview: pokaż podgląd HTML (podaj html lub url)
- switch_tab: przełącz tab (terminal, files, code, preview)
- show_diff: pokaż diff pliku (podaj file_path, before, after, hunks)

Użyj gdy chcesz pokazać użytkownikowi plik, podgląd wygenerowanego HTML, terminal, lub diff zmian.`,
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: [...VALID_ACTIONS],
            description: "Akcja do wykonania",
          },
          // open_file
          file_path: {
            type: "string",
            description: "Ścieżka do pliku (dla open_file i show_diff)",
          },
          // show_preview
          html: {
            type: "string",
            description: "HTML do wyświetlenia w preview (dla show_preview)",
          },
          url: {
            type: "string",
            description: "URL do załadowania w preview (dla show_preview)",
          },
          // switch_tab
          tab: {
            type: "string",
            enum: [...VALID_TABS],
            description: "Nazwa taba (dla switch_tab)",
          },
          // show_diff
          before: {
            type: "string",
            description: "Treść pliku przed zmianą (dla show_diff)",
          },
          after: {
            type: "string",
            description: "Treść pliku po zmianie (dla show_diff)",
          },
          hunks: {
            type: "array",
            description: "Hunki diff (dla show_diff)",
            items: {
              type: "object",
              properties: {
                oldStart: { type: "number" },
                newStart: { type: "number" },
                lines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["context", "add", "remove"],
                      },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        required: ["action"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const action = input.action as string;

      if (!VALID_ACTIONS.includes(action as (typeof VALID_ACTIONS)[number])) {
        return `Nieprawidłowa akcja: ${action}. Dostępne: ${VALID_ACTIONS.join(", ")}`;
      }

      switch (action) {
        case "open_file": {
          const filePath = input.file_path as string;
          if (!filePath) return "Brak file_path dla akcji open_file.";
          return encodeSSEDirective(
            "workspace_update",
            { action: "open_file", filePath },
            `Otwarto plik: ${filePath}`,
          );
        }

        case "show_preview": {
          const html = input.html as string | undefined;
          const url = input.url as string | undefined;
          if (!html && !url)
            return "Podaj html lub url dla akcji show_preview.";
          return encodeSSEDirective(
            "workspace_update",
            {
              action: "show_preview",
              ...(html ? { html } : {}),
              ...(url ? { url } : {}),
            },
            `Pokazano podgląd${url ? `: ${url}` : " HTML"}`,
          );
        }

        case "switch_tab": {
          const tab = input.tab as string;
          if (
            !tab ||
            !VALID_TABS.includes(tab as (typeof VALID_TABS)[number])
          ) {
            return `Nieprawidłowy tab: ${tab}. Dostępne: ${VALID_TABS.join(", ")}`;
          }
          return encodeSSEDirective(
            "workspace_update",
            { action: "switch_tab", tab },
            `Przełączono na tab: ${tab}`,
          );
        }

        case "show_diff": {
          const filePath = input.file_path as string;
          const before = input.before as string;
          const after = input.after as string;
          const hunks = input.hunks as unknown[];
          if (!filePath || !hunks)
            return "Podaj file_path i hunks dla akcji show_diff.";
          return encodeSSEDirective(
            "workspace_update",
            { action: "show_diff", filePath, before, after, hunks },
            `Pokazano diff: ${filePath}`,
          );
        }

        default:
          return `Nieobsługiwana akcja: ${action}`;
      }
    },
  },
];
