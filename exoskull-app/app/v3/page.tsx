"use client";

/**
 * /v3 — Standalone v3 Chat Page
 *
 * Self-contained: own auth, own chat, no dashboard dependencies.
 * Hits /api/v3/chat/stream for the v3 agent pipeline.
 * Features: voice input, file upload, TTS, markdown rendering.
 */

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import { useDictation } from "@/lib/hooks/useDictation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ============================================================================
// TYPES
// ============================================================================

interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  attachments?: Attachment[];
}

interface ThinkingStep {
  step: string;
  status: string;
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function V2Page() {
  const [session, setSession] = useState<{
    access_token: string;
    user: { id: string; email?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession({
          access_token: data.session.access_token,
          user: { id: data.session.user.id, email: data.session.user.email },
        });
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        setSession({
          access_token: s.access_token,
          user: { id: s.user.id, email: s.user.email },
        });
      } else {
        setSession(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return <ChatView session={session} />;
}

// ============================================================================
// LOGIN FORM
// ============================================================================

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.center}>
      <form onSubmit={handleLogin} style={styles.loginForm}>
        <h1 style={styles.logo}>ExoSkull v3</h1>
        <p style={styles.subtitle}>Cyfrowy Żywy Organizm</p>

        {error && <div style={styles.error}>{error}</div>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          autoFocus
        />
        <input
          type="password"
          placeholder="Hasło"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Logowanie..." : "Zaloguj"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// CHAT VIEW
// ============================================================================

function ChatView({
  session,
}: {
  session: { access_token: string; user: { id: string; email?: string } };
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input
  const dictation = useDictation({
    authToken: session.access_token,
    onFinalTranscript: (text) => {
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    },
    onError: (err) => {
      console.error("[Voice]", err);
    },
  });

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, thinkingSteps, scrollToBottom]);

  // TTS: speak new assistant messages
  const lastMsgCountRef = useRef(0);
  useEffect(() => {
    if (!ttsEnabled || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (
      last.role === "assistant" &&
      !streaming &&
      messages.length > lastMsgCountRef.current
    ) {
      lastMsgCountRef.current = messages.length;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(last.content);
        utterance.lang = "pl-PL";
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [messages, streaming, ttsEnabled]);

  // File upload handler
  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) return; // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            dataUrl: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (streaming) return;

    // Stop voice if active
    if (dictation.isListening) dictation.stopListening();

    // Build message with attachments
    let fullMessage = text;
    const currentAttachments = [...attachments];
    if (currentAttachments.length > 0) {
      const attachInfo = currentAttachments
        .map((a) => `[Plik: ${a.name} (${a.type})]`)
        .join(" ");
      fullMessage = text ? `${text}\n\n${attachInfo}` : attachInfo;
    }

    setInput("");
    setAttachments([]);
    setStreaming(true);
    setThinkingSteps([]);
    setActiveTool(null);

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: fullMessage,
        attachments: currentAttachments.length ? currentAttachments : undefined,
      },
    ]);

    // Add empty assistant message to fill
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/v3/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: fullMessage }),
      });

      if (!response.ok) {
        const err = await response.text();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Błąd: ${response.status} — ${err.slice(0, 200)}`,
          };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let toolsUsed: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "delta":
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
                break;

              case "thinking_step":
                setThinkingSteps((prev) => [
                  ...prev,
                  { step: data.step, status: data.status },
                ]);
                break;

              case "tool_start":
                setActiveTool(data.label || data.tool);
                toolsUsed.push(data.tool);
                break;

              case "tool_end":
                setActiveTool(null);
                break;

              case "done":
                if (data.toolsUsed) toolsUsed = data.toolsUsed;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: data.fullText || last.content,
                      toolsUsed: toolsUsed.length ? toolsUsed : undefined,
                    };
                  }
                  return updated;
                });
                break;

              case "error":
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: data.message || "Wystąpił błąd.",
                  };
                  return updated;
                });
                break;
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Błąd połączenia: ${err instanceof Error ? err.message : "Unknown"}`,
        };
        return updated;
      });
    }

    setStreaming(false);
    setActiveTool(null);
    setThinkingSteps([]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div style={styles.chatContainer}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <span style={styles.headerTitle}>ExoSkull v3</span>
          <span style={styles.headerSub}> — {session.user.email}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              setTtsEnabled((v) => !v);
              if (ttsEnabled && typeof window !== "undefined") {
                window.speechSynthesis?.cancel();
              }
            }}
            style={{
              ...styles.logoutBtn,
              color: ttsEnabled ? "#3b82f6" : "#888",
              borderColor: ttsEnabled ? "#3b82f6" : "#333",
            }}
            title={ttsEnabled ? "TTS wlaczone" : "TTS wylaczone"}
          >
            {ttsEnabled ? "TTS ON" : "TTS"}
          </button>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Wyloguj
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          ...styles.messageList,
          ...(dragOver
            ? { outline: "2px dashed #3b82f6", outlineOffset: -4 }
            : {}),
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              Cześć! Jestem ExoSkull v3.
            </h2>
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              Cyfrowy żywy organizm. Powiedz mi swój cel — zrealizuję go.
            </p>
            <div style={styles.suggestions}>
              {[
                "Jakie mam cele?",
                "Zbuduj mi tracker nastroju",
                "Co potrafisz?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                  }}
                  style={styles.suggestionBtn}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={msg.role === "user" ? styles.userMsg : styles.assistantMsg}
          >
            <div style={styles.msgRole}>
              {msg.role === "user" ? "Ty" : "ExoSkull"}
            </div>
            <div style={styles.msgContent}>
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ margin: "4px 0" }}>{children}</p>
                    ),
                    code: ({ children, className }) =>
                      className ? (
                        <pre
                          style={{
                            background: "#0a0a12",
                            padding: "8px 12px",
                            borderRadius: 6,
                            overflow: "auto",
                            fontSize: 13,
                          }}
                        >
                          <code>{children}</code>
                        </pre>
                      ) : (
                        <code
                          style={{
                            background: "#1a1a2e",
                            padding: "2px 5px",
                            borderRadius: 3,
                            fontSize: 13,
                          }}
                        >
                          {children}
                        </code>
                      ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#60a5fa" }}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {msg.content ||
                    (streaming && i === messages.length - 1 ? "..." : "")}
                </ReactMarkdown>
              ) : (
                msg.content ||
                (streaming && i === messages.length - 1 ? "..." : "")
              )}
            </div>
            {msg.attachments && msg.attachments.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginTop: 4,
                  flexWrap: "wrap" as const,
                }}
              >
                {msg.attachments.map((a, j) => (
                  <span
                    key={j}
                    style={{
                      fontSize: 11,
                      background: "#1a1a2e",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "#888",
                    }}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div style={styles.toolsUsed}>
                Użyto: {msg.toolsUsed.join(", ")}
              </div>
            )}
          </div>
        ))}

        {/* Thinking / Tool indicators */}
        {streaming && (activeTool || thinkingSteps.length > 0) && (
          <div style={styles.thinkingBox}>
            {thinkingSteps.map((s, i) => (
              <div key={i} style={styles.thinkingStep}>
                {s.status === "done" ? "✓" : "⟳"} {s.step}
              </div>
            ))}
            {activeTool && (
              <div style={styles.activeTool}>⚡ {activeTool}...</div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div style={styles.attachmentBar}>
          {attachments.map((a, i) => (
            <div key={i} style={styles.attachmentChip}>
              <span style={{ fontSize: 12 }}>{a.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                style={styles.attachmentRemove}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Voice status */}
      {dictation.isListening && (
        <div style={styles.voiceStatus}>{dictation.interimTranscript}</div>
      )}

      {/* Input */}
      <form onSubmit={sendMessage} style={styles.inputBar}>
        {/* Upload button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.json,.md"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={streaming}
          style={styles.iconBtn}
          title="Dodaj plik"
        >
          +
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            dictation.isListening
              ? "Mow..."
              : streaming
                ? "Czekam na odpowiedz..."
                : "Napisz cos..."
          }
          disabled={streaming}
          style={styles.chatInput}
          autoFocus
        />

        {/* Mic button */}
        {dictation.isSupported && (
          <button
            type="button"
            onClick={dictation.toggleListening}
            disabled={streaming}
            style={{
              ...styles.iconBtn,
              color: dictation.isListening ? "#ef4444" : "#888",
              borderColor: dictation.isListening ? "#ef4444" : "#333",
            }}
            title={dictation.isListening ? "Zatrzymaj nagrywanie" : "Mow"}
          >
            {dictation.isListening ? "||" : "mic"}
          </button>
        )}

        <button
          type="submit"
          disabled={streaming || (!input.trim() && attachments.length === 0)}
          style={styles.sendBtn}
        >
          {streaming ? "..." : ">"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// STYLES (inline — zero external deps)
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e0e0e0",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #333",
    borderTop: "3px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loginForm: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: 320,
    padding: 32,
    background: "#111118",
    borderRadius: 12,
    border: "1px solid #222",
  },
  logo: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#3b82f6",
    textAlign: "center" as const,
  },
  subtitle: {
    margin: "0 0 8px",
    fontSize: 13,
    color: "#666",
    textAlign: "center" as const,
  },
  error: {
    padding: "8px 12px",
    background: "#2a1515",
    border: "1px solid #441111",
    borderRadius: 6,
    color: "#f87171",
    fontSize: 13,
  },
  input: {
    padding: "10px 14px",
    background: "#1a1a24",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
  },
  button: {
    padding: "10px 0",
    background: "#3b82f6",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#0a0a0f",
    color: "#e0e0e0",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    borderBottom: "1px solid #1a1a24",
    background: "#0e0e16",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#3b82f6",
  },
  headerSub: {
    fontSize: 12,
    color: "#555",
  },
  logoutBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#888",
    fontSize: 12,
    cursor: "pointer",
  },
  messageList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 20px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  emptyState: {
    margin: "auto",
    textAlign: "center" as const,
    padding: 40,
    opacity: 0.8,
  },
  suggestions: {
    display: "flex",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  suggestionBtn: {
    padding: "8px 14px",
    background: "#1a1a24",
    border: "1px solid #333",
    borderRadius: 20,
    color: "#aaa",
    fontSize: 13,
    cursor: "pointer",
  },
  userMsg: {
    alignSelf: "flex-end" as const,
    maxWidth: "75%",
    padding: "10px 16px",
    background: "#1a2a4a",
    borderRadius: "16px 16px 4px 16px",
  },
  assistantMsg: {
    alignSelf: "flex-start" as const,
    maxWidth: "85%",
    padding: "10px 16px",
    background: "#141420",
    borderRadius: "16px 16px 16px 4px",
    border: "1px solid #1a1a28",
  },
  msgRole: {
    fontSize: 11,
    color: "#555",
    marginBottom: 4,
    fontWeight: 600,
  },
  msgContent: {
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  toolsUsed: {
    fontSize: 11,
    color: "#555",
    marginTop: 6,
    borderTop: "1px solid #222",
    paddingTop: 4,
  },
  thinkingBox: {
    padding: "8px 16px",
    background: "#111118",
    borderRadius: 8,
    border: "1px solid #1a1a28",
    fontSize: 12,
    color: "#777",
  },
  thinkingStep: {
    padding: "2px 0",
  },
  activeTool: {
    color: "#3b82f6",
    fontWeight: 500,
  },
  inputBar: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    borderTop: "1px solid #1a1a24",
    background: "#0e0e16",
  },
  chatInput: {
    flex: 1,
    padding: "12px 16px",
    background: "#1a1a24",
    border: "1px solid #333",
    borderRadius: 10,
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    padding: "12px 20px",
    background: "#3b82f6",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  iconBtn: {
    padding: "10px 14px",
    background: "transparent",
    border: "1px solid #333",
    borderRadius: 10,
    color: "#888",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  attachmentBar: {
    display: "flex",
    gap: 6,
    padding: "6px 20px",
    background: "#0e0e16",
    flexWrap: "wrap" as const,
  },
  attachmentChip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "#1a1a2e",
    borderRadius: 6,
    border: "1px solid #333",
    color: "#aaa",
  },
  attachmentRemove: {
    background: "none",
    border: "none",
    color: "#666",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 2px",
  },
  voiceStatus: {
    padding: "4px 20px",
    background: "#0e0e16",
    fontSize: 12,
    color: "#ef4444",
  },
};
