"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useStreamState } from "@/lib/hooks/useStreamState";
import { StreamEventRouter } from "./StreamEventRouter";
import { VoiceInputBar } from "./VoiceInputBar";
import { EmptyState } from "./EmptyState";
import { ThreadBranch, ThreadSidebar } from "./ThreadBranch";
import { Loader2, X, Reply, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppStore } from "@/lib/stores/useAppStore";
import type {
  StreamEvent,
  AIMessageData,
  ChannelType,
  SystemNotificationData,
  CodeBlockData,
  MediaContentData,
  ToolExecutionData,
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
  spatialMode?: boolean;
  ttsEnabled?: boolean;
  onToggleTTS?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedStream({
  className,
  spatialMode,
  ttsEnabled: ttsEnabledProp,
  onToggleTTS: onToggleTTSProp,
}: UnifiedStreamProps) {
  const {
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
  } = useStreamState();

  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef(0); // Monotonic counter to prevent stale SSE events

  // ---------------------------------------------------------------------------
  // TTS (Text-to-Speech) — reads AI responses aloud
  // ---------------------------------------------------------------------------

  const [ttsEnabledInternal, setTtsEnabledInternal] = useState(true);
  const ttsEnabled = ttsEnabledProp ?? ttsEnabledInternal;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  // Load TTS preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem("exo-tts-enabled");
      if (stored !== null) setTtsEnabledInternal(stored === "true");
    } catch {
      /* noop */
    }
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      ttsAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const speakText = useCallback(
    async (text: string) => {
      if (!ttsEnabled) return;

      // Cancel any in-flight TTS
      ttsAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const controller = new AbortController();
      ttsAbortRef.current = controller;

      try {
        setIsSpeaking(true);

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova" }),
          signal: controller.signal,
        });

        if (!res.ok) {
          console.error("[TTS] API error:", res.status);
          setIsSpeaking(false);
          return;
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        await audio.play();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[TTS] Playback error:", err);
        }
        setIsSpeaking(false);
      }
    },
    [ttsEnabled],
  );

  const toggleTTS = useCallback(() => {
    if (onToggleTTSProp) {
      onToggleTTSProp();
      return;
    }
    if (isSpeaking) {
      // Stop current playback
      ttsAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSpeaking(false);
    } else {
      const next = !ttsEnabledInternal;
      setTtsEnabledInternal(next);
      try {
        localStorage.setItem("exo-tts-enabled", String(next));
      } catch {
        /* noop */
      }
      if (!next && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsSpeaking(false);
      }
    }
  }, [onToggleTTSProp, isSpeaking, ttsEnabledInternal]);

  // ---------------------------------------------------------------------------
  // Scroll management
  // ---------------------------------------------------------------------------

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const last = state.events[state.events.length - 1];
    if (!last) return;
    // Auto-scroll for AI messages and thinking (not for history load)
    const isAiEvent =
      last.data.type === "ai_message" || last.data.type === "thinking_step";
    if (isAiEvent || isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current!.scrollHeight,
          behavior: "smooth",
        });
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

    let cancelled = false;

    async function fetchHistory() {
      try {
        const [threadRes, eventsRes] = await Promise.allSettled([
          fetch("/api/unified-thread?limit=30"),
          fetch("/api/stream/events?limit=10"),
        ]);

        if (cancelled) return;

        const historyEvents: StreamEvent[] = [];

        // Thread messages → user/ai/channel events
        if (threadRes.status === "fulfilled" && threadRes.value.ok) {
          const data = await threadRes.value.json();
          const messages = data.messages || data || [];

          console.log(`[UnifiedStream] Loading ${messages.length} messages`);

          for (const msg of messages) {
            if (!msg.content) continue;

            const evtId = `hist-${msg.id || Date.now()}`;
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

        if (cancelled) return;

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
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    }

    fetchHistory();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Reply handler — sets reply-to context for next message
  // ---------------------------------------------------------------------------

  const handleReply = useCallback(
    (event: StreamEvent) => {
      let preview = "";
      const d = event.data;
      if (d.type === "user_message") preview = d.content;
      else if (d.type === "user_voice") preview = d.transcript;
      else if (d.type === "ai_message") preview = d.content;
      else if (d.type === "channel_message") preview = d.content;

      const senderRole: "user" | "ai" | "system" =
        d.type === "user_message" || d.type === "user_voice"
          ? "user"
          : d.type === "ai_message"
            ? "ai"
            : "system";

      setReplyTo({
        id: event.id,
        preview: preview.slice(0, 100) + (preview.length > 100 ? "..." : ""),
        senderRole,
      });
    },
    [setReplyTo],
  );

  // ---------------------------------------------------------------------------
  // Send message via SSE
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string, type: "text" | "voice_transcript" = "text") => {
      if (!text.trim() || state.isLoading) return;

      // Cancel any in-flight request and increment stream generation
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const currentStreamId = ++streamIdRef.current;

      // Capture and clear reply-to context
      const currentReplyTo = state.replyTo;
      setReplyTo(null);

      // 1. Add user event
      const userEvent: StreamEvent = {
        id: `user-${Date.now()}`,
        timestamp: new Date(),
        data:
          type === "voice_transcript"
            ? { type: "user_voice", transcript: text.trim() }
            : { type: "user_message", content: text.trim() },
        ...(currentReplyTo ? { replyTo: currentReplyTo } : {}),
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
          if (res.status === 401) {
            // Auto-redirect to login after session expiry
            setTimeout(() => window.location.assign("/login"), 2000);
            throw new Error("Sesja wygasla. Przekierowuję do logowania...");
          }
          if (res.status === 429) {
            throw new Error(
              errBody.error || "Zbyt wiele zapytan. Odczekaj chwile.",
            );
          }
          throw new Error(
            errBody.error || errBody.message || `Blad serwera (${res.status})`,
          );
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");

        let buffer = "";
        // Track whether thinking event was created (avoids stale state.events.find)
        let thinkingEventCreated = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Guard: stop processing if a newer stream has started
          if (streamIdRef.current !== currentStreamId) break;

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
                  speakText(data.fullText);
                  break;

                // Phase 2: thinking/tool events
                case "thinking_step": {
                  // Consolidate all thinking into ONE event per AI response
                  const thinkingId = `thinking-${aiEventId}`;
                  if (!thinkingEventCreated) {
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
                    thinkingEventCreated = true;
                  } else {
                    // Update existing — use updateThinkingSteps by ID (no stale find)
                    updateThinkingSteps(thinkingId, [
                      { label: data.step, status: data.status || "running" },
                    ]);
                  }
                  break;
                }

                case "thinking_token": {
                  // Stream thinking text — append to single thinking event
                  const ttThinkingId = `thinking-${aiEventId}`;
                  if (!thinkingEventCreated) {
                    addEvent({
                      id: ttThinkingId,
                      timestamp: new Date(),
                      data: {
                        type: "thinking_step",
                        steps: [
                          {
                            label: data.text || "",
                            status: "running",
                            detail: data.text || "",
                          },
                        ],
                        startedAt: Date.now(),
                      },
                    });
                    thinkingEventCreated = true;
                  } else {
                    // Append to existing thinking detail via reducer (sentinel label)
                    updateThinkingSteps(ttThinkingId, [
                      {
                        label: "__append__",
                        status: "running",
                        detail: data.text || "",
                      },
                    ]);
                  }
                  break;
                }

                case "thinking_done": {
                  // Mark thinking as complete — no stale find needed
                  const tdThinkingId = `thinking-${aiEventId}`;
                  if (thinkingEventCreated) {
                    updateThinkingSteps(tdThinkingId, [
                      { label: "__all__", status: "done" },
                    ]);
                  }
                  break;
                }

                case "tool_start": {
                  // Fold tool into single thinking event
                  const tsThinkingId = `thinking-${aiEventId}`;
                  if (!thinkingEventCreated) {
                    addEvent({
                      id: tsThinkingId,
                      timestamp: new Date(),
                      data: {
                        type: "thinking_step",
                        steps: [],
                        toolActions: [
                          {
                            toolName: data.tool,
                            displayLabel: data.label || data.tool,
                            status: "running",
                          },
                        ],
                      },
                    });
                    thinkingEventCreated = true;
                  } else {
                    updateThinkingTools(tsThinkingId, [
                      {
                        toolName: data.tool,
                        displayLabel: data.label || data.tool,
                        status: "running" as const,
                      },
                    ]);
                  }
                  break;
                }

                case "tool_end": {
                  // Update tool status in thinking event
                  const teThinkingId = `thinking-${aiEventId}`;
                  if (thinkingEventCreated) {
                    updateThinkingTools(teThinkingId, [
                      {
                        toolName: data.tool,
                        displayLabel: data.label || data.tool,
                        status: (data.success === false ? "error" : "done") as
                          | "done"
                          | "error",
                        durationMs: data.durationMs,
                        resultSummary: data.resultSummary,
                        success: data.success !== false,
                      },
                    ]);
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

                case "file_change": {
                  // Notify app store → opens code sidebar + highlights file
                  useAppStore.getState().notifyFileChange(data.filePath);
                  break;
                }

                // Workstream B: new inline event types
                case "code_block": {
                  addEvent({
                    id: `code-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    timestamp: new Date(),
                    data: {
                      type: "code_block",
                      language: data.language || "text",
                      code: data.code || "",
                      filename: data.filename,
                      executable: data.executable,
                      highlightLines: data.highlightLines,
                    } as CodeBlockData,
                  });
                  break;
                }

                case "media_content": {
                  addEvent({
                    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    timestamp: new Date(),
                    data: {
                      type: "media_content",
                      mediaType: data.mediaType || "image",
                      url: data.url || "",
                      title: data.title,
                      caption: data.caption,
                      mimeType: data.mimeType,
                      fileSize: data.fileSize,
                      thumbnailUrl: data.thumbnailUrl,
                      dimensions: data.dimensions,
                    } as MediaContentData,
                  });
                  break;
                }

                case "tool_execution": {
                  const existingTool = state.events.find(
                    (e) =>
                      e.data.type === "tool_execution" &&
                      (e.data as ToolExecutionData).toolName ===
                        data.toolName &&
                      (e.data as ToolExecutionData).status === "running",
                  );

                  if (existingTool) {
                    // Update existing running tool execution via reducer
                    updateToolExecution(
                      existingTool.id,
                      data.status || "running",
                      {
                        outputPreview: data.outputPreview,
                        durationMs: data.durationMs,
                        progress: data.progress,
                        logs: data.logs,
                      },
                    );
                  } else {
                    addEvent({
                      id: `toolexec-${data.toolName || "unknown"}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                      timestamp: new Date(),
                      data: {
                        type: "tool_execution",
                        toolName: data.toolName || data.tool || "unknown",
                        displayLabel:
                          data.displayLabel ||
                          data.label ||
                          data.toolName ||
                          "Tool",
                        status: data.status || "running",
                        inputPreview: data.inputPreview,
                        outputPreview: data.outputPreview,
                        durationMs: data.durationMs,
                        progress: data.progress,
                        logs: data.logs,
                      } as ToolExecutionData,
                    });
                  }
                  break;
                }

                case "cockpit_update": {
                  // Legacy cockpit event — ignored in new UI
                  break;
                }

                // ------------------------------------
                // Multi-agent events (from VPS backend)
                // ------------------------------------

                case "delegation": {
                  addEvent({
                    id: `delegation-${Date.now()}`,
                    timestamp: new Date(),
                    data: {
                      type: "agent_communication",
                      agentName: "Orchestrator",
                      targetName: data.to?.join(", "),
                      content: `${data.strategy}: ${data.reasoning || ""}`,
                    },
                  });
                  break;
                }

                case "agent_start": {
                  addEvent({
                    id: `agent-start-${data.agentId}-${Date.now()}`,
                    timestamp: new Date(),
                    data: {
                      type: "agent_action",
                      toolName: data.agentId,
                      displayLabel: `${data.agentName}: ${data.task || ""}`,
                      status: "running",
                    },
                  });
                  break;
                }

                case "agent_delta": {
                  // Stream agent text into the main AI message
                  updateAIMessage(aiEventId, data.text);
                  break;
                }

                case "agent_end": {
                  // Update agent action to done
                  const agentStartId = state.events.find(
                    (e) =>
                      e.data.type === "agent_action" &&
                      e.data.toolName === data.agentId &&
                      e.data.status === "running",
                  )?.id;
                  if (agentStartId) {
                    updateAgentAction(
                      agentStartId,
                      data.status === "failed" ? "error" : "done",
                      data.durationMs,
                    );
                  }
                  break;
                }

                case "agent_handoff": {
                  addEvent({
                    id: `handoff-${Date.now()}`,
                    timestamp: new Date(),
                    data: {
                      type: "agent_communication",
                      agentName: data.from,
                      targetName: data.to,
                      content: `Przekazuję: ${data.context?.slice(0, 100) || ""}`,
                    },
                  });
                  break;
                }

                case "mcp_tool_start": {
                  const mcpThinkingId = `thinking-${aiEventId}`;
                  if (!thinkingEventCreated) {
                    addEvent({
                      id: mcpThinkingId,
                      timestamp: new Date(),
                      data: {
                        type: "thinking_step",
                        steps: [],
                        toolActions: [
                          {
                            toolName: `${data.server}/${data.tool}`,
                            displayLabel: `[${data.server}] ${data.tool}`,
                            status: "running",
                          },
                        ],
                      },
                    });
                    thinkingEventCreated = true;
                  } else {
                    updateThinkingTools(mcpThinkingId, [
                      {
                        toolName: `${data.server}/${data.tool}`,
                        displayLabel: `[${data.server}] ${data.tool}`,
                        status: "running" as const,
                      },
                    ]);
                  }
                  break;
                }

                case "mcp_tool_end": {
                  const mcpTeThinkingId = `thinking-${aiEventId}`;
                  if (thinkingEventCreated) {
                    updateThinkingTools(mcpTeThinkingId, [
                      {
                        toolName: `${data.server}/${data.tool}`,
                        displayLabel: `[${data.server}] ${data.tool}`,
                        status: (data.success === false ? "error" : "done") as
                          | "done"
                          | "error",
                        durationMs: data.durationMs,
                        success: data.success !== false,
                      },
                    ]);
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
      state.replyTo,
      addEvent,
      updateAIMessage,
      finalizeAIMessage,
      updateAgentAction,
      updateThinkingSteps,
      updateThinkingTools,
      updateToolExecution,
      setLoading,
      setConversationId,
      setReplyTo,
      speakText,
    ],
  );

  // ---------------------------------------------------------------------------
  // Listen for FAB voice messages (FloatingMicFAB dispatches custom events)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (text) sendMessage(text, "voice_transcript");
    };
    window.addEventListener("exo-voice-message", handler);
    return () => window.removeEventListener("exo-voice-message", handler);
  }, [sendMessage]);

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
            fileSize: file.size,
          }),
        });

        if (!urlRes.ok) throw new Error("Nie udalo sie uzyskac URL uploadu");
        const { signedUrl, documentId, mimeType } = await urlRes.json();

        // 3. Upload directly to storage (use correct MIME from server)
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType || file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) throw new Error("Upload nie powiodl sie");

        // 4. Update status → processing
        updateFileUpload(eventId, "processing");

        // 5. Confirm upload → triggers RAG processing
        const confirmRes = await fetch("/api/knowledge/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
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
  // Toast for system notifications
  // ---------------------------------------------------------------------------

  const prevEventCountRef = useRef(0);
  useEffect(() => {
    const events = state.events;
    if (events.length <= prevEventCountRef.current) {
      prevEventCountRef.current = events.length;
      return;
    }
    // Check only new events
    const newEvents = events.slice(prevEventCountRef.current);
    prevEventCountRef.current = events.length;

    for (const ev of newEvents) {
      if (ev.data.type === "system_notification") {
        const d = ev.data as SystemNotificationData;
        const severity = d.severity;
        if (severity === "warning") {
          toast.warning(d.message);
        } else if (severity === "success") {
          toast.success(d.message);
        } else {
          toast.info(d.message);
        }
      }
    }
  }, [state.events]);

  // ---------------------------------------------------------------------------
  // Thread computation — group replies by parent event
  // ---------------------------------------------------------------------------

  const threadMap = useMemo(() => {
    const map = new Map<string, StreamEvent[]>();
    for (const event of state.events) {
      if (event.replyTo) {
        const parentId = event.replyTo.id;
        if (!map.has(parentId)) map.set(parentId, []);
        map.get(parentId)!.push(event);
      }
    }
    return map;
  }, [state.events]);

  // Active thread sidebar data
  const activeThreadEvent = useMemo(() => {
    if (!state.activeThread) return null;
    return state.events.find((e) => e.id === state.activeThread) || null;
  }, [state.activeThread, state.events]);

  const activeThreadReplies = useMemo(() => {
    if (!state.activeThread) return [];
    return threadMap.get(state.activeThread) || [];
  }, [state.activeThread, threadMap]);

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

      {!spatialMode && (
        <div className="flex flex-1 min-h-0">
          {/* Stream area */}
          <div className="flex-1 flex flex-col min-w-0">
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

              {historyLoaded &&
                state.events.length === 0 &&
                !state.isLoading && (
                  <EmptyState
                    onQuickAction={(text) => sendMessage(text, "text")}
                  />
                )}

              {state.events.map((event, idx) => {
                // Skip events that are inline replies (they're shown via ThreadBranch)
                // But still render them if thread sidebar is not active
                const isReplyEvent = !!event.replyTo;

                // Time separator: show when gap > 1 hour between events
                let timeSeparator: React.ReactNode = null;
                if (idx > 0 && !isReplyEvent) {
                  const prev = state.events[idx - 1];
                  const gap =
                    event.timestamp.getTime() - prev.timestamp.getTime();
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

                // Get replies for this event
                const replies = threadMap.get(event.id) || [];

                return (
                  <div key={event.id}>
                    {timeSeparator}
                    <StreamEventRouter event={event} onReply={handleReply} />
                    {/* Thread branch indicator (inline expandable) */}
                    {replies.length > 0 && (
                      <ThreadBranch
                        parentEvent={event}
                        replies={replies}
                        onReply={handleReply}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thread sidebar (Slack-like, slides in when active) */}
          {activeThreadEvent && (
            <ThreadSidebar
              parentEvent={activeThreadEvent}
              replies={activeThreadReplies}
              onClose={() => setActiveThread(null)}
              onReply={handleReply}
            />
          )}
        </div>
      )}

      {/* Reply-to preview strip — always visible */}
      {state.replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
          <Reply className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-primary">
              {state.replyTo.senderRole === "user"
                ? "Ty"
                : state.replyTo.senderRole === "ai"
                  ? "ExoSkull"
                  : "System"}
            </span>
            <p className="text-xs text-muted-foreground truncate">
              {state.replyTo.preview}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input bar — always visible */}
      <VoiceInputBar
        onSendText={(text) => sendMessage(text, "text")}
        onSendVoice={(transcript) =>
          sendMessage(transcript, "voice_transcript")
        }
        onFileUpload={handleFileUpload}
        isLoading={state.isLoading}
        ttsEnabled={ttsEnabled}
        isSpeaking={isSpeaking}
        onToggleTTS={toggleTTS}
      />
    </div>
  );
}
