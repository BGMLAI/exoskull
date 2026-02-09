"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useStreamState } from "@/lib/hooks/useStreamState";
import { StreamEventRouter } from "./StreamEventRouter";
import { VoiceInputBar } from "./VoiceInputBar";
import { EmptyState } from "./EmptyState";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, AIMessageData } from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UnifiedStreamProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedStream({ className }: UnifiedStreamProps) {
  const {
    state,
    addEvent,
    updateAIMessage,
    finalizeAIMessage,
    updateAgentAction,
    updateThinkingSteps,
    setLoading,
    setConversationId,
    setError,
    loadHistory,
  } = useStreamState();

  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Scroll management
  // ---------------------------------------------------------------------------

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [state.events]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load history on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (historyLoaded) return;

    async function fetchHistory() {
      try {
        const [threadRes, eventsRes] = await Promise.allSettled([
          fetch("/api/unified-thread?limit=30"),
          fetch("/api/stream/events?limit=10"),
        ]);

        const historyEvents: StreamEvent[] = [];

        // Thread messages → user/ai events
        if (threadRes.status === "fulfilled" && threadRes.value.ok) {
          const data = await threadRes.value.json();
          const messages = data.messages || data || [];
          for (const msg of messages) {
            if (!msg.content) continue;
            historyEvents.push({
              id: `hist-${msg.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: new Date(msg.created_at || Date.now()),
              data:
                msg.role === "user"
                  ? { type: "user_message", content: msg.content }
                  : {
                      type: "ai_message",
                      content: msg.content,
                      isStreaming: false,
                    },
            });
          }
        }

        // Stream events (activity, emotions, insights)
        if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
          const data = await eventsRes.value.json();
          for (const evt of data.events || []) {
            historyEvents.push({
              ...evt,
              timestamp: new Date(evt.timestamp),
            });
          }
        }

        // Sort chronologically and load
        historyEvents.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );
        if (historyEvents.length > 0) {
          loadHistory(historyEvents);
        }
      } catch (err) {
        console.error("[UnifiedStream] History load failed:", err);
      } finally {
        setHistoryLoaded(true);
      }
    }

    fetchHistory();
  }, [historyLoaded, loadHistory]);

  // ---------------------------------------------------------------------------
  // Send message via SSE
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string, type: "text" | "voice_transcript" = "text") => {
      if (!text.trim() || state.isLoading) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 1. Add user event
      const userEvent: StreamEvent = {
        id: `user-${Date.now()}`,
        timestamp: new Date(),
        data:
          type === "voice_transcript"
            ? { type: "user_voice", transcript: text.trim() }
            : { type: "user_message", content: text.trim() },
      };
      addEvent(userEvent);

      // 2. Add empty AI message event
      const aiEventId = `ai-${Date.now()}`;
      const aiEvent: StreamEvent = {
        id: aiEventId,
        timestamp: new Date(),
        data: {
          type: "ai_message",
          content: "",
          isStreaming: true,
        } as AIMessageData,
      };
      addEvent(aiEvent);
      setLoading(true);

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            conversationId: state.conversationId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            errBody.error || errBody.message || `Blad serwera (${res.status})`,
          );
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "session":
                  if (data.conversationId) {
                    setConversationId(data.conversationId);
                  }
                  break;

                case "delta":
                  updateAIMessage(aiEventId, data.text);
                  break;

                case "done":
                  finalizeAIMessage(aiEventId, data.fullText, data.toolsUsed);
                  break;

                // Phase 2: thinking/tool events
                case "thinking_step": {
                  // Find or create thinking event
                  const thinkingId = `thinking-${aiEventId}`;
                  const existing = state.events.find(
                    (e) => e.id === thinkingId,
                  );
                  if (!existing) {
                    addEvent({
                      id: thinkingId,
                      timestamp: new Date(),
                      data: {
                        type: "thinking_step",
                        steps: [
                          {
                            label: data.step,
                            status: data.status || "running",
                          },
                        ],
                      },
                    });
                  } else if (existing.data.type === "thinking_step") {
                    const steps = [...existing.data.steps];
                    const idx = steps.findIndex((s) => s.label === data.step);
                    if (idx >= 0) {
                      steps[idx] = {
                        ...steps[idx],
                        status: data.status || "done",
                      };
                    } else {
                      steps.push({
                        label: data.step,
                        status: data.status || "running",
                      });
                    }
                    updateThinkingSteps(thinkingId, steps);
                  }
                  break;
                }

                case "tool_start":
                  addEvent({
                    id: `tool-${data.tool}-${Date.now()}`,
                    timestamp: new Date(),
                    data: {
                      type: "agent_action",
                      toolName: data.tool,
                      displayLabel: data.label || data.tool,
                      status: "running",
                    },
                  });
                  break;

                case "tool_end": {
                  // Find the running action for this tool
                  const actionEvent = state.events.find(
                    (e) =>
                      e.data.type === "agent_action" &&
                      e.data.toolName === data.tool &&
                      e.data.status === "running",
                  );
                  if (actionEvent) {
                    updateAgentAction(actionEvent.id, "done", data.durationMs);
                  }
                  break;
                }

                case "error":
                  finalizeAIMessage(
                    aiEventId,
                    data.message || "Wystapil blad.",
                  );
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[UnifiedStream] Send error:", err);
        const errorMsg =
          err instanceof Error && err.message !== "Failed to fetch"
            ? err.message
            : "Przepraszam, wystapil blad. Sprobuj ponownie.";
        finalizeAIMessage(aiEventId, errorMsg);
      } finally {
        setLoading(false);
      }
    },
    [
      state.isLoading,
      state.conversationId,
      state.events,
      addEvent,
      updateAIMessage,
      finalizeAIMessage,
      updateAgentAction,
      updateThinkingSteps,
      setLoading,
      setConversationId,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Stream area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {!historyLoaded && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {historyLoaded && state.events.length === 0 && !state.isLoading && (
          <EmptyState onQuickAction={(text) => sendMessage(text, "text")} />
        )}

        {state.events.map((event, idx) => {
          // Time separator: show when gap > 1 hour between events
          let timeSeparator: React.ReactNode = null;
          if (idx > 0) {
            const prev = state.events[idx - 1];
            const gap = event.timestamp.getTime() - prev.timestamp.getTime();
            if (gap > 60 * 60 * 1000) {
              const now = new Date();
              const isToday =
                event.timestamp.toDateString() === now.toDateString();
              const isYesterday =
                event.timestamp.toDateString() ===
                new Date(now.getTime() - 86400000).toDateString();
              const label = isToday
                ? `Dzisiaj, ${event.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
                : isYesterday
                  ? `Wczoraj, ${event.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
                  : event.timestamp.toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
              timeSeparator = (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground/60">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              );
            }
          }
          return (
            <div key={event.id}>
              {timeSeparator}
              <StreamEventRouter event={event} />
            </div>
          );
        })}
      </div>

      {/* Input bar */}
      <VoiceInputBar
        onSendText={(text) => sendMessage(text, "text")}
        onSendVoice={(transcript) =>
          sendMessage(transcript, "voice_transcript")
        }
        isLoading={state.isLoading}
      />
    </div>
  );
}
