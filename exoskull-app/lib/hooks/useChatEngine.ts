"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useStreamState } from "@/lib/hooks/useStreamState";
import { useAppStore } from "@/lib/stores/useAppStore";
import { toast } from "sonner";
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
// IORS state derivation
// ---------------------------------------------------------------------------

export type IorsState =
  | "idle"
  | "thinking"
  | "speaking"
  | "building"
  | "listening";

// ---------------------------------------------------------------------------
// Third-party tool → service mapping
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
// Hook return type
// ---------------------------------------------------------------------------

export interface UseChatEngineReturn {
  events: StreamEvent[];
  isLoading: boolean;
  conversationId: string | null;
  historyLoaded: boolean;
  sendMessage: (text: string, type?: "text" | "voice_transcript") => void;
  handleFileUpload: (file: File) => void;
  handleReply: (event: StreamEvent) => void;
  iorsState: IorsState;
  ttsEnabled: boolean;
  isSpeaking: boolean;
  toggleTTS: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  threadMap: Map<string, StreamEvent[]>;
  activeThreadEvent: StreamEvent | null;
  activeThreadReplies: StreamEvent[];
  setActiveThread: (id: string | null) => void;
  replyTo: StreamEvent["replyTo"] | null;
  setReplyTo: (val: StreamEvent["replyTo"] | null) => void;
  // Drag & drop
  isDragging: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  // Scroll
  handleScroll: () => void;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface UseChatEngineOptions {
  ttsEnabled?: boolean;
  onToggleTTS?: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatEngine(
  options: UseChatEngineOptions = {},
): UseChatEngineReturn {
  const { ttsEnabled: ttsEnabledProp, onToggleTTS: onToggleTTSProp } = options;

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
  const streamIdRef = useRef(0);

  // ── TTS ──────────────────────────────────────────────────────────────────

  const [ttsEnabledInternal, setTtsEnabledInternal] = useState(true);
  const ttsEnabled = ttsEnabledProp ?? ttsEnabledInternal;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("exo-tts-enabled");
      if (stored !== null) setTtsEnabledInternal(stored === "true");
    } catch {
      /* noop */
    }
  }, []);

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

  // ── Scroll ───────────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const last = state.events[state.events.length - 1];
    if (!last) return;
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Load history ─────────────────────────────────────────────────────────

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

        if (threadRes.status === "fulfilled" && threadRes.value.ok) {
          const data = await threadRes.value.json();
          const messages = data.messages || data || [];

          for (const msg of messages) {
            if (!msg.content) continue;
            const evtId = `hist-${msg.id || Date.now()}`;
            const evtTs = new Date(msg.created_at || Date.now());
            const channel: string = msg.channel || "web_chat";

            if (channel !== "web_chat") {
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
        historyEvents.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );
        if (historyEvents.length > 0) {
          loadHistory(historyEvents);
        }
      } catch (err) {
        console.error("[useChatEngine] History load failed:", err);
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

  // ── Reply handler ────────────────────────────────────────────────────────

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

  // ── Send message via SSE ─────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, type: "text" | "voice_transcript" = "text") => {
      if (!text.trim() || state.isLoading) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const currentStreamId = ++streamIdRef.current;

      const currentReplyTo = state.replyTo;
      setReplyTo(null);

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
        let thinkingEventCreated = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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

                case "thinking_step": {
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
                    updateThinkingSteps(thinkingId, [
                      { label: data.step, status: data.status || "running" },
                    ]);
                  }
                  break;
                }

                case "thinking_token": {
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
                  const tdThinkingId = `thinking-${aiEventId}`;
                  if (thinkingEventCreated) {
                    updateThinkingSteps(tdThinkingId, [
                      { label: "__all__", status: "done" },
                    ]);
                  }
                  break;
                }

                case "tool_start": {
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
                  useAppStore.getState().notifyFileChange(data.filePath);
                  break;
                }

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

                case "cockpit_update":
                  break;

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
                  updateAIMessage(aiEventId, data.text);
                  break;
                }

                case "agent_end": {
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
        console.error("[useChatEngine] Send error:", err);
        const errorMsg =
          err instanceof Error && err.message !== "Failed to fetch"
            ? err.message
            : "Wystąpił błąd. Spróbuj ponownie.";
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

  // ── FAB voice events ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (text) sendMessage(text, "voice_transcript");
    };
    window.addEventListener("exo-voice-message", handler);
    return () => window.removeEventListener("exo-voice-message", handler);
  }, [sendMessage]);

  // ── File upload ──────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const eventId = `upload-${Date.now()}`;
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

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

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", () => {});

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(
                new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`),
              );
            }
          });

          xhr.addEventListener("error", () =>
            reject(new Error("Blad sieci podczas uploadu")),
          );
          xhr.addEventListener("abort", () =>
            reject(new Error("Upload anulowany")),
          );

          xhr.open("PUT", signedUrl);
          xhr.setRequestHeader(
            "Content-Type",
            mimeType || file.type || "application/octet-stream",
          );
          xhr.send(file);
        });

        updateFileUpload(eventId, "processing");

        const confirmRes = await fetch("/api/knowledge/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });

        if (!confirmRes.ok)
          throw new Error("Potwierdzenie uploadu nie powiodlo sie");
        const confirmData = await confirmRes.json();

        updateFileUpload(
          eventId,
          "ready",
          confirmData.chunks || confirmData.document?.chunk_count,
        );

        sendMessage(
          `[Wgrałem plik: ${file.name} (${sizeMB} MB). Potwierdź że go widzisz w bazie wiedzy.]`,
          "text",
        );
      } catch (err) {
        console.error("[useChatEngine] File upload failed:", err);
        updateFileUpload(eventId, "failed");
      }
    },
    [addEvent, updateFileUpload, sendMessage],
  );

  // ── Drag & drop ──────────────────────────────────────────────────────────

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

  // ── System notification toasts ───────────────────────────────────────────

  const prevEventCountRef = useRef(0);
  useEffect(() => {
    const events = state.events;
    if (events.length <= prevEventCountRef.current) {
      prevEventCountRef.current = events.length;
      return;
    }
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

  // ── Thread computation ───────────────────────────────────────────────────

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

  const activeThreadEvent = useMemo(() => {
    if (!state.activeThread) return null;
    return state.events.find((e) => e.id === state.activeThread) || null;
  }, [state.activeThread, state.events]);

  const activeThreadReplies = useMemo(() => {
    if (!state.activeThread) return [];
    return threadMap.get(state.activeThread) || [];
  }, [state.activeThread, threadMap]);

  // ── Derived IORS state ───────────────────────────────────────────────────

  const iorsState: IorsState = useMemo(() => {
    if (isSpeaking) return "speaking";
    if (state.isLoading) {
      // Check last event for building signal
      const last = state.events[state.events.length - 1];
      if (last?.data.type === "tool_execution") return "building";
      if (
        last?.data.type === "thinking_step" &&
        (last.data as any).toolActions?.some(
          (t: any) => t.toolName === "build_app" && t.status === "running",
        )
      ) {
        return "building";
      }
      return "thinking";
    }
    return "idle";
  }, [isSpeaking, state.isLoading, state.events]);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    events: state.events,
    isLoading: state.isLoading,
    conversationId: state.conversationId,
    historyLoaded,
    sendMessage,
    handleFileUpload,
    handleReply,
    iorsState,
    ttsEnabled,
    isSpeaking,
    toggleTTS,
    scrollRef,
    threadMap,
    activeThreadEvent,
    activeThreadReplies,
    setActiveThread,
    replyTo: state.replyTo,
    setReplyTo,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleScroll,
  };
}
