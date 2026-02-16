/**
 * Dashboard modification IORS tools.
 * Allows IORS to show/hide/expand panels on the spatial 3D dashboard.
 *
 * When executed, returns a result string with an embedded SSE directive
 * (prefixed with __SSE__) that the agent-loop extracts and emits as a
 * cockpit_update event to the client.
 */

import type { ToolDefinition } from "./index";

// ---------------------------------------------------------------------------
// SSE directive helpers
// ---------------------------------------------------------------------------

/**
 * Encode an SSE event directive into the tool result string.
 * The agent-loop's onToolEnd handler will detect and extract this,
 * emitting it as a separate SSE event before forwarding the clean result.
 */
function encodeSSEDirective(
  sseType: string,
  sseData: Record<string, unknown>,
  humanResult: string,
): string {
  return `__SSE__${JSON.stringify({ type: sseType, ...sseData })}__SSE__${humanResult}`;
}

/**
 * Check if a tool result contains an SSE directive.
 * Returns null if no directive found.
 */
export function extractSSEDirective(result: string): {
  sseEvent: { type: string; [key: string]: unknown } | null;
  cleanResult: string;
} {
  const match = result.match(/^__SSE__(.+?)__SSE__([\s\S]*)$/);
  if (!match) return { sseEvent: null, cleanResult: result };

  try {
    const sseEvent = JSON.parse(match[1]);
    return { sseEvent, cleanResult: match[2] };
  } catch {
    return { sseEvent: null, cleanResult: result };
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ["show_panel", "hide_panel", "expand_panel"] as const;
const VALID_PANELS = [
  "stats",
  "tasks",
  "activity",
  "knowledge",
  "email",
  "calendar",
] as const;

const ACTION_LABELS: Record<string, string> = {
  show_panel: "Pokazano",
  hide_panel: "Ukryto",
  expand_panel: "Rozwinięto",
};

const PANEL_LABELS: Record<string, string> = {
  stats: "Status",
  tasks: "Zadania",
  activity: "Aktywność IORS",
  knowledge: "Wiedza",
  email: "Email",
  calendar: "Kalendarz",
};

export const dashboardTools: ToolDefinition[] = [
  {
    definition: {
      name: "modify_dashboard",
      description:
        "Modyfikuj layout 3D dashboardu użytkownika. Pokaż, ukryj lub rozwiń panele danych. " +
        "Dostępne panele: stats, tasks, activity, knowledge, email, calendar. " +
        'Użyj gdy user prosi o wyświetlenie danych (np. "pokaż mi maile", "ukryj zadania", "rozwiń statystyki").',
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: [...VALID_ACTIONS],
            description:
              "Akcja do wykonania: show_panel (pokaż), hide_panel (ukryj), expand_panel (rozwiń/zwiń)",
          },
          panel_id: {
            type: "string",
            enum: [...VALID_PANELS],
            description: "ID panelu do modyfikacji",
          },
        },
        required: ["action", "panel_id"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const action = input.action as string;
      const panelId = input.panel_id as string;

      if (!VALID_ACTIONS.includes(action as (typeof VALID_ACTIONS)[number])) {
        return `Nieprawidłowa akcja: ${action}. Dostępne: ${VALID_ACTIONS.join(", ")}`;
      }
      if (!VALID_PANELS.includes(panelId as (typeof VALID_PANELS)[number])) {
        return `Nieprawidłowy panel: ${panelId}. Dostępne: ${VALID_PANELS.join(", ")}`;
      }

      const actionLabel = ACTION_LABELS[action] || action;
      const panelLabel = PANEL_LABELS[panelId] || panelId;
      const humanResult = `${actionLabel} panel "${panelLabel}" na dashboardzie.`;

      // Embed SSE directive for cockpit_update event
      return encodeSSEDirective(
        "cockpit_update",
        { action, panel_id: panelId },
        humanResult,
      );
    },
  },
];
