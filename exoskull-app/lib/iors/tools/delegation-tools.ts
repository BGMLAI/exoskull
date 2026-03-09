/**
 * Auto-Delegation IORS Tool
 *
 * Analyzes task complexity and delegates to the right specialist agent.
 * Uses heuristics: message length, keyword presence, step count.
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

const AGENT_TYPES: Record<string, { keywords: string[]; description: string }> =
  {
    code_builder: {
      keywords: [
        "build",
        "code",
        "deploy",
        "app",
        "api",
        "zbuduj",
        "aplikacja",
        "wdróż",
      ],
      description: "Builds apps, writes code, deploys to VPS",
    },
    researcher: {
      keywords: [
        "research",
        "analyze",
        "find",
        "search",
        "analiza",
        "zbadaj",
        "szukaj",
      ],
      description: "Deep research, web search, document analysis",
    },
    communicator: {
      keywords: [
        "email",
        "sms",
        "call",
        "send",
        "wyślij",
        "zadzwoń",
        "kontakt",
      ],
      description: "Sends emails, SMS, makes calls, manages contacts",
    },
    planner: {
      keywords: [
        "plan",
        "schedule",
        "organize",
        "strategy",
        "zaplanuj",
        "strategia",
      ],
      description: "Creates plans, schedules, strategies for goals",
    },
    data_analyst: {
      keywords: [
        "data",
        "report",
        "metrics",
        "chart",
        "raport",
        "dane",
        "wykres",
      ],
      description: "Analyzes data, generates reports, creates visualizations",
    },
  };

function scoreComplexity(description: string): number {
  let score = 0;
  // Length-based scoring
  if (description.length > 200) score += 2;
  else if (description.length > 100) score += 1;
  // Step indicators
  const stepWords = [
    "then",
    "next",
    "after",
    "finally",
    "potem",
    "następnie",
    "na koniec",
    "oraz",
    "i ",
  ];
  for (const word of stepWords) {
    if (description.toLowerCase().includes(word)) score += 1;
  }
  // Multi-domain indicators
  const domains = Object.values(AGENT_TYPES);
  let domainMatches = 0;
  for (const agent of domains) {
    if (
      agent.keywords.some((k) =>
        description.toLowerCase().includes(k.toLowerCase()),
      )
    ) {
      domainMatches++;
    }
  }
  if (domainMatches >= 2) score += 2;
  return Math.min(score, 10);
}

function matchAgentType(description: string): string {
  let bestMatch = "general";
  let bestScore = 0;

  for (const [type, config] of Object.entries(AGENT_TYPES)) {
    const matches = config.keywords.filter((k) =>
      description.toLowerCase().includes(k.toLowerCase()),
    ).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestMatch = type;
    }
  }

  return bestMatch;
}

/**
 * Merge results from multiple parallel agent executions.
 * Deduplicates similar findings, synthesizes into unified output.
 */
function mergeAgentResults(
  results: Array<{ agent: string; result: string; success: boolean }>,
): string {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  if (successes.length === 0) {
    return `Wszystkie ${results.length} agentów zawiodły:\n${failures.map((f) => `- ${f.agent}: ${f.result.slice(0, 200)}`).join("\n")}`;
  }

  // Simple dedup: if results are very similar, pick the longest one
  const uniqueResults: typeof successes = [];
  for (const r of successes) {
    const isDuplicate = uniqueResults.some(
      (u) =>
        u.result.slice(0, 100) === r.result.slice(0, 100) ||
        u.result.length > r.result.length * 0.9,
    );
    if (!isDuplicate) uniqueResults.push(r);
  }

  if (uniqueResults.length === 1) {
    return uniqueResults[0].result;
  }

  const merged = uniqueResults
    .map((r) => `### ${r.agent}\n${r.result.slice(0, 1000)}`)
    .join("\n\n");

  return (
    `Wyniki z ${uniqueResults.length} agentów (${failures.length} failed):\n\n` +
    merged
  );
}

export const delegationTools: ToolDefinition[] = [
  {
    definition: {
      name: "auto_delegate",
      description:
        "Przeanalizuj zadanie i zdeleguj do specjalisty. " +
        "System oceni złożoność, dopasuje agenta i utworzy zadanie w kolejce. " +
        "Użyj do: złożonych wieloetapowych zadań, gdy potrzebna specjalizacja.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_description: {
            type: "string",
            description: "Opis zadania do zdelegowania",
          },
          preferred_agent: {
            type: "string",
            enum: [
              "code_builder",
              "researcher",
              "communicator",
              "planner",
              "data_analyst",
              "auto",
            ],
            description:
              'Preferowany typ agenta. "auto" = system wybierze (domyślnie).',
          },
          priority: {
            type: "integer",
            description: "Priorytet 1-10 (domyślnie 5)",
          },
        },
        required: ["task_description"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const description = input.task_description as string;
      const priority = Math.min(Math.max(Number(input.priority) || 5, 1), 10);

      // Score complexity
      const complexity = scoreComplexity(description);

      // Match agent type
      const preferredAgent = input.preferred_agent as string;
      const agentType =
        preferredAgent && preferredAgent !== "auto"
          ? preferredAgent
          : matchAgentType(description);

      const agentInfo = AGENT_TYPES[agentType];

      // Enqueue the delegated task
      const { data, error } = await supabase
        .from("exo_autonomy_queue")
        .insert({
          tenant_id: tenantId,
          type: "delegated_task",
          payload: {
            description,
            agent_type: agentType,
            complexity_score: complexity,
            delegated_at: new Date().toISOString(),
          },
          priority,
          source: "auto_delegate",
        })
        .select("id")
        .single();

      if (error) {
        return `Error: nie mogę zdelegować zadania: ${error.message}`;
      }

      // Log delegation
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "task_delegated",
        payload: {
          task_id: data.id,
          agent_type: agentType,
          complexity_score: complexity,
          description: description.slice(0, 200),
        },
      });

      return (
        `Zadanie zdelegowane.\n` +
        `Agent: ${agentType} — ${agentInfo?.description || "general purpose"}\n` +
        `Złożoność: ${complexity}/10\n` +
        `Priorytet: ${priority}/10\n` +
        `ID: ${data.id}\n` +
        `System wykona to w tle w ciągu najbliższych 15 min (heartbeat loop).`
      );
    },
  },

  {
    definition: {
      name: "coordinate_agents",
      description:
        "Uruchom wiele zadań równolegle (DIPPER pattern). " +
        "System zdeleguje każde do najlepszego agenta, uruchomi równolegle, " +
        "i zwróci połączone wyniki. Max 5 zadań jednocześnie.",
      input_schema: {
        type: "object" as const,
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Opis zadania",
                },
                agent_type: {
                  type: "string",
                  description:
                    "Typ agenta (auto|code_builder|researcher|communicator|planner|data_analyst)",
                },
              },
              required: ["description"],
            },
            description: "Lista zadań do równoległego wykonania (max 5)",
          },
        },
        required: ["tasks"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const tasks = input.tasks as Array<{
        description: string;
        agent_type?: string;
      }>;

      if (!tasks || tasks.length === 0) {
        return "Error: podaj przynajmniej jedno zadanie.";
      }

      if (tasks.length > 5) {
        return "Error: max 5 zadań równolegle.";
      }

      const supabase = getServiceSupabase();

      // Queue all tasks in parallel
      const queueResults = await Promise.all(
        tasks.map(async (task) => {
          const agentType =
            task.agent_type && task.agent_type !== "auto"
              ? task.agent_type
              : matchAgentType(task.description);

          const complexity = scoreComplexity(task.description);

          const { data, error } = await supabase
            .from("exo_autonomy_queue")
            .insert({
              tenant_id: tenantId,
              type: "coordinated_task",
              payload: {
                description: task.description,
                agent_type: agentType,
                complexity_score: complexity,
                coordinated: true,
                delegated_at: new Date().toISOString(),
              },
              priority: 7, // Higher priority for coordinated tasks
              source: "coordinate_agents",
            })
            .select("id")
            .single();

          if (error) {
            return {
              agent: agentType,
              result: `Error: ${error.message}`,
              success: false,
            };
          }

          return {
            agent: agentType,
            result: `Queued: ${task.description.slice(0, 80)} (ID: ${data.id})`,
            success: true,
          };
        }),
      );

      // Log coordination event
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "agents_coordinated",
        payload: {
          task_count: tasks.length,
          agents: queueResults.map((r) => r.agent),
          all_queued: queueResults.every((r) => r.success),
        },
      });

      return mergeAgentResults(queueResults);
    },
  },
];
