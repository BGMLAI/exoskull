"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useStreamState } from "@/lib/hooks/useStreamState";
import { StreamEventRouter } from "./StreamEventRouter";
import { VoiceInputBar } from "./VoiceInputBar";
import { EmptyState } from "./EmptyState";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StreamEvent,
  AIMessageData,
  ChannelType,
} from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Third-party tool → service mapping (for Chat Rzeka stream events)
// ---------------------------------------------------------------------------

const THIRD_PARTY_TOOL_MAP: Record<
  string,
  { service: string; action: string }
> = {
  send_email: { service: "Gmail", action: "Wyslanie emaila" },
  send_whatsapp: { service: "WhatsApp", action: "Wyslanie wiadomosci" },
  send_sms: { service: "SMS", action: "Wyslanie SMS" },
  search_web: { service: "Tavily", action: "Szukanie w internecie" },
  fetch_webpage: { service: "Firecrawl", action: "Pobieranie strony" },
  import_url: { service: "Firecrawl", action: "Import URL do bazy wiedzy" },
  create_calendar_event: {
    service: "Kalendarz",
    action: "Tworzenie wydarzenia",
  },
  check_calendar: { service: "Kalendarz", action: "Sprawdzanie kalendarza" },
  build_app: { service: "App Builder", action: "Budowanie aplikacji" },
  search_emails: { service: "Email", action: "Przeszukiwanie emaili" },
  email_summary: { service: "Email", action: "Podsumowanie emaili" },
};

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
    updateFileUpload,
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

        // Thread messages → user/ai/channel events
        if (threadRes.status === "fulfilled" && threadRes.value.ok) {
          const data = await threadRes.value.json();
          const messages = data.messages || data || [];
          for (const msg of messages) {
            if (!msg.content) continue;

            const evtId = `hist-${msg.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const evtTs = new Date(msg.created_at || Date.now());
            const channel: string = msg.channel || "web_chat";

            if (channel !== "web_chat") {
              // Non-web_chat → channel_message (WhatsApp, Telegram, SMS, etc.)
              // Voice channel with call metadata → call_transcript
              if (channel === "voice" && msg.metadata?.call_transcript) {
                historyEvents.push({
                  id: evtId,
                  timestamp: evtTs,
                  data: {
                    type: "call_transcript",
                    direction:
                      msg.direction ||
                      (msg.role === "user" ? "inbound" : "outbound"),
                    callerName:
                      msg.metadata?.sender_name || msg.metadata?.caller_name,
                    transcript: msg.content,
                    durationSec: msg.metadata?.duration_sec,
                    recordingUrl: msg.metadata?.recording_url,
                  },
                });
              } else {
                historyEvents.push({
                  id: evtId,
                  timestamp: evtTs,
                  data: {
                    type: "channel_message",
                    channel: channel as ChannelType,
                    direction:
                      msg.direction ||
                      (msg.role === "user" ? "inbound" : "outbound"),
                    content: msg.content,
                    senderName: msg.metadata?.sender_name,
                    from: msg.metadata?.from,
                  },
                });
              }
            } else {
              // Standard web_chat messages → user/ai events
              historyEvents.push({
                id: evtId,
                timestamp: evtTs,
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

                  // Emit third_party_action for external service tools
                  const tpInfo = THIRD_PARTY_TOOL_MAP[data.tool];
                  if (tpInfo) {
                    addEvent({
                      id: `tp-${data.tool}-${Date.now()}`,
                      timestamp: new Date(),
                      data: {
                        type: "third_party_action",
                        service: tpInfo.service,
                        action: tpInfo.action,
                        resultSummary: data.resultSummary || "",
                        success: data.success !== false,
                      },
                    });
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
  // File upload via presigned URL
  // ---------------------------------------------------------------------------

  const handleFileUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const eventId = `upload-${Date.now()}`;

      // 1. Show uploading state in stream
      addEvent({
        id: eventId,
        timestamp: new Date(),
        data: {
          type: "file_upload",
          filename: file.name,
          fileType: ext,
          fileSize: file.size,
          status: "uploading",
        },
      });

      try {
        // 2. Get presigned upload URL
        const urlRes = await fetch("/api/knowledge/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
          }),
        });

        if (!urlRes.ok) throw new Error("Nie udalo sie uzyskac URL uploadu");
        const { signedUrl, path } = await urlRes.json();

        // 3. Upload directly to storage
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!uploadRes.ok) throw new Error("Upload nie powiodl sie");

        // 4. Update status → processing
        updateFileUpload(eventId, "processing");

        // 5. Confirm upload → triggers RAG processing
        const confirmRes = await fetch("/api/knowledge/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path,
            filename: file.name,
            fileType: ext,
            fileSize: file.size,
          }),
        });

        if (!confirmRes.ok)
          throw new Error("Potwierdzenie uploadu nie powiodlo sie");
        const confirmData = await confirmRes.json();

        // 6. Update status → ready
        updateFileUpload(
          eventId,
          "ready",
          confirmData.chunks || confirmData.document?.chunk_count,
        );
      } catch (err) {
        console.error("[UnifiedStream] File upload failed:", err);
        updateFileUpload(eventId, "failed");
      }
    },
    [addEvent, updateFileUpload],
  );

  // ---------------------------------------------------------------------------
  // Drag & drop zone
  // ---------------------------------------------------------------------------

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        handleFileUpload(files[i]);
      }
    },
    [handleFileUpload],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={cn("flex flex-col h-full relative", className)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <p className="text-lg font-medium text-primary">Upusc pliki tutaj</p>
        </div>
      )}

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
        onFileUpload={handleFileUpload}
        isLoading={state.isLoading}
      />
    </div>
  );
}
