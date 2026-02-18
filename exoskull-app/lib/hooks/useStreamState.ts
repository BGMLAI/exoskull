"use client";

import { useReducer, useCallback } from "react";
import type {
  StreamEvent,
  AIMessageData,
  FileUploadData,
  ThinkingStep,
  ThinkingStepData,
  ToolAction,
  ToolExecutionData,
} from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface StreamState {
  events: StreamEvent[];
  isLoading: boolean;
  conversationId: string | null;
  error: string | null;
  /** Active reply-to context (user is composing a reply) */
  replyTo: StreamEvent["replyTo"] | null;
  /** Active thread sidebar event id */
  activeThread: string | null;
}

const initialState: StreamState = {
  events: [],
  isLoading: false,
  conversationId: null,
  error: null,
  replyTo: null,
  activeThread: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type StreamAction =
  | { type: "ADD_EVENT"; event: StreamEvent }
  | { type: "UPDATE_AI_MESSAGE"; id: string; content: string }
  | {
      type: "FINALIZE_AI_MESSAGE";
      id: string;
      content: string;
      toolsUsed?: string[];
    }
  | {
      type: "UPDATE_AGENT_ACTION";
      id: string;
      status: "done" | "error";
      durationMs?: number;
    }
  | { type: "UPDATE_THINKING_STEPS"; id: string; steps: ThinkingStep[] }
  | { type: "UPDATE_THINKING_TOOLS"; id: string; toolActions: ToolAction[] }
  | {
      type: "UPDATE_FILE_UPLOAD";
      id: string;
      status: FileUploadData["status"];
      chunks?: number;
    }
  | {
      type: "UPDATE_TOOL_EXECUTION";
      id: string;
      status: ToolExecutionData["status"];
      progress?: number;
      outputPreview?: string;
      durationMs?: number;
      logs?: string[];
    }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_CONVERSATION_ID"; id: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_HISTORY"; events: StreamEvent[] }
  | { type: "SET_REPLY_TO"; replyTo: StreamEvent["replyTo"] | null }
  | { type: "SET_ACTIVE_THREAD"; threadId: string | null };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "ADD_EVENT":
      return { ...state, events: [...state.events, action.event] };

    case "UPDATE_AI_MESSAGE":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id && e.data.type === "ai_message"
            ? {
                ...e,
                data: {
                  ...e.data,
                  content: (e.data as AIMessageData).content + action.content,
                } as AIMessageData,
              }
            : e,
        ),
      };

    case "FINALIZE_AI_MESSAGE":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id && e.data.type === "ai_message"
            ? {
                ...e,
                data: {
                  ...e.data,
                  content: action.content,
                  isStreaming: false,
                  toolsUsed: action.toolsUsed,
                } as AIMessageData,
              }
            : e,
        ),
      };

    case "UPDATE_AGENT_ACTION":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id && e.data.type === "agent_action"
            ? {
                ...e,
                data: {
                  ...e.data,
                  status: action.status,
                  durationMs: action.durationMs,
                },
              }
            : e,
        ),
      };

    case "UPDATE_THINKING_STEPS":
      return {
        ...state,
        events: state.events.map((e) => {
          if (e.id !== action.id || e.data.type !== "thinking_step") return e;
          const existing = (e.data as ThinkingStepData).steps;
          const incoming = action.steps;
          // Special: mark all steps as done
          if (
            incoming.length === 1 &&
            incoming[0].label === "__all__" &&
            incoming[0].status === "done"
          ) {
            return {
              ...e,
              data: {
                ...e.data,
                steps: existing.map((s) => ({ ...s, status: "done" as const })),
                isComplete: true,
              },
            };
          }
          // Special: append detail to first step (thinking_token streaming)
          if (incoming.length === 1 && incoming[0].label === "__append__") {
            const merged = [...existing];
            if (merged.length > 0) {
              merged[0] = {
                ...merged[0],
                detail: (merged[0].detail || "") + (incoming[0].detail || ""),
                status: "running",
              };
            } else {
              merged.push({
                label: incoming[0].label,
                status: "running",
                detail: incoming[0].detail,
              });
            }
            return { ...e, data: { ...e.data, steps: merged } };
          }
          // Default: merge by label (update existing or add new)
          const merged = [...existing];
          for (const step of incoming) {
            const idx = merged.findIndex((s) => s.label === step.label);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...step };
            } else {
              merged.push(step);
            }
          }
          return { ...e, data: { ...e.data, steps: merged } };
        }),
      };

    case "UPDATE_THINKING_TOOLS":
      return {
        ...state,
        events: state.events.map((e) => {
          if (e.id !== action.id || e.data.type !== "thinking_step") return e;
          const existing = (e.data as ThinkingStepData).toolActions || [];
          const incoming = action.toolActions;
          // Merge: update existing tool by name (first running match), or add new
          const merged = [...existing];
          for (const tool of incoming) {
            const idx = merged.findIndex(
              (t) => t.toolName === tool.toolName && t.status === "running",
            );
            if (idx >= 0 && tool.status !== "running") {
              // Update existing running tool to done/error
              merged[idx] = { ...merged[idx], ...tool };
            } else if (tool.status === "running") {
              // Add new running tool
              merged.push(tool);
            }
          }
          return {
            ...e,
            data: { ...e.data, toolActions: merged } as ThinkingStepData,
          };
        }),
      };

    case "UPDATE_FILE_UPLOAD":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id && e.data.type === "file_upload"
            ? {
                ...e,
                data: {
                  ...e.data,
                  status: action.status,
                  ...(action.chunks !== undefined
                    ? { chunks: action.chunks }
                    : {}),
                } as FileUploadData,
              }
            : e,
        ),
      };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    case "SET_CONVERSATION_ID":
      return { ...state, conversationId: action.id };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "LOAD_HISTORY": {
      const existingIds = new Set(state.events.map((e) => e.id));
      const newEvents = action.events.filter((e) => !existingIds.has(e.id));
      return { ...state, events: [...newEvents, ...state.events] };
    }

    case "UPDATE_TOOL_EXECUTION":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id && e.data.type === "tool_execution"
            ? {
                ...e,
                data: {
                  ...e.data,
                  status: action.status,
                  ...(action.progress !== undefined
                    ? { progress: action.progress }
                    : {}),
                  ...(action.outputPreview !== undefined
                    ? { outputPreview: action.outputPreview }
                    : {}),
                  ...(action.durationMs !== undefined
                    ? { durationMs: action.durationMs }
                    : {}),
                  ...(action.logs !== undefined ? { logs: action.logs } : {}),
                } as ToolExecutionData,
              }
            : e,
        ),
      };

    case "SET_REPLY_TO":
      return { ...state, replyTo: action.replyTo };

    case "SET_ACTIVE_THREAD":
      return { ...state, activeThread: action.threadId };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStreamState() {
  const [state, dispatch] = useReducer(streamReducer, initialState);

  const addEvent = useCallback(
    (event: StreamEvent) => dispatch({ type: "ADD_EVENT", event }),
    [],
  );

  const updateAIMessage = useCallback(
    (id: string, content: string) =>
      dispatch({ type: "UPDATE_AI_MESSAGE", id, content }),
    [],
  );

  const finalizeAIMessage = useCallback(
    (id: string, content: string, toolsUsed?: string[]) =>
      dispatch({ type: "FINALIZE_AI_MESSAGE", id, content, toolsUsed }),
    [],
  );

  const updateAgentAction = useCallback(
    (id: string, status: "done" | "error", durationMs?: number) =>
      dispatch({ type: "UPDATE_AGENT_ACTION", id, status, durationMs }),
    [],
  );

  const updateThinkingSteps = useCallback(
    (id: string, steps: ThinkingStep[]) =>
      dispatch({ type: "UPDATE_THINKING_STEPS", id, steps }),
    [],
  );

  const updateThinkingTools = useCallback(
    (id: string, toolActions: ToolAction[]) =>
      dispatch({ type: "UPDATE_THINKING_TOOLS", id, toolActions }),
    [],
  );

  const updateFileUpload = useCallback(
    (id: string, status: FileUploadData["status"], chunks?: number) =>
      dispatch({ type: "UPDATE_FILE_UPLOAD", id, status, chunks }),
    [],
  );

  const setLoading = useCallback(
    (loading: boolean) => dispatch({ type: "SET_LOADING", loading }),
    [],
  );

  const setConversationId = useCallback(
    (id: string) => dispatch({ type: "SET_CONVERSATION_ID", id }),
    [],
  );

  const setError = useCallback(
    (error: string | null) => dispatch({ type: "SET_ERROR", error }),
    [],
  );

  const loadHistory = useCallback(
    (events: StreamEvent[]) => dispatch({ type: "LOAD_HISTORY", events }),
    [],
  );

  const updateToolExecution = useCallback(
    (
      id: string,
      status: ToolExecutionData["status"],
      extra?: {
        progress?: number;
        outputPreview?: string;
        durationMs?: number;
        logs?: string[];
      },
    ) =>
      dispatch({
        type: "UPDATE_TOOL_EXECUTION",
        id,
        status,
        ...extra,
      }),
    [],
  );

  const setReplyTo = useCallback(
    (replyTo: StreamEvent["replyTo"] | null) =>
      dispatch({ type: "SET_REPLY_TO", replyTo }),
    [],
  );

  const setActiveThread = useCallback(
    (threadId: string | null) =>
      dispatch({ type: "SET_ACTIVE_THREAD", threadId }),
    [],
  );

  return {
    state,
    addEvent,
    updateAIMessage,
    finalizeAIMessage,
    updateAgentAction,
    updateThinkingSteps,
    updateThinkingTools,
    updateFileUpload,
    updateToolExecution,
    setLoading,
    setConversationId,
    setError,
    loadHistory,
    setReplyTo,
    setActiveThread,
  };
}
