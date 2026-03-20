"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus = "disconnected" | "connecting" | "connected";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TerminalTab() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  // ── Connect to terminal ─────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (status === "connecting") return;
    setStatus("connecting");

    try {
      // 1. Request session token from our API
      const res = await fetch("/api/claude-code/terminal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Session creation failed (${res.status})`);
      }

      const { token, wsUrl } = await res.json();

      // 2. Dynamically import xterm.js (SSR-safe)
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all(
        [
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
        ],
      );

      // 3. Create terminal if not already created
      if (!xtermRef.current) {
        const term = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          theme: {
            background: "#0a0a0f",
            foreground: "#e0e0e0",
            cursor: "#00d4ff",
            selectionBackground: "#00d4ff33",
            black: "#1a1a2e",
            red: "#ff6b6b",
            green: "#51cf66",
            yellow: "#ffd43b",
            blue: "#339af0",
            magenta: "#cc5de8",
            cyan: "#22b8cf",
            white: "#e0e0e0",
            brightBlack: "#495057",
            brightRed: "#ff8787",
            brightGreen: "#69db7c",
            brightYellow: "#ffe066",
            brightBlue: "#5c7cfa",
            brightMagenta: "#da77f2",
            brightCyan: "#3bc9db",
            brightWhite: "#f8f9fa",
          },
          allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);

        if (terminalRef.current) {
          term.open(terminalRef.current);
          fitAddon.fit();
        }

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
      }

      // 4. Connect WebSocket to VPS terminal
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        reconnectAttempts.current = 0;

        // Send initial resize
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = xtermRef.current;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      };

      ws.onmessage = (event) => {
        const data = event.data;
        // Check if it's a JSON control message
        try {
          const msg = JSON.parse(data);
          if (msg.type === "exit") {
            xtermRef.current?.writeln(
              `\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m`,
            );
            setStatus("disconnected");
            return;
          }
        } catch {
          // Not JSON — it's terminal output
        }
        xtermRef.current?.write(data);
      };

      ws.onclose = () => {
        setStatus("disconnected");
        // Auto-reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000;
          reconnectAttempts.current++;
          xtermRef.current?.writeln(
            `\r\n\x1b[33m[Reconnecting in ${delay / 1000}s...]\x1b[0m`,
          );
          setTimeout(() => connect(), delay);
        }
      };

      ws.onerror = () => {
        // onclose will handle reconnection
      };

      // 5. Forward terminal input to WebSocket
      xtermRef.current.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    } catch (err) {
      console.error("[TerminalTab] Connection failed:", err);
      setStatus("disconnected");
      xtermRef.current?.writeln(
        `\r\n\x1b[31m[Connection failed: ${err instanceof Error ? err.message : "Unknown error"}]\x1b[0m`,
      );
    }
  }, [status]);

  // ── Initialize on mount ──────────────────────────────────────────────
  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
      // Don't dispose terminal — keep it for reconnection
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle resize ────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      }
    };

    window.addEventListener("resize", handleResize);

    // Also observe container resize
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, []);

  // ── Status indicator ─────────────────────────────────────────────────
  const StatusIcon =
    status === "connected" ? Wifi : status === "connecting" ? Loader2 : WifiOff;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn(
              "h-3 w-3",
              status === "connected" && "text-green-500",
              status === "connecting" && "text-yellow-500 animate-spin",
              status === "disconnected" && "text-muted-foreground",
            )}
          />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {status === "connected"
              ? "Connected"
              : status === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>
        </div>
        {status === "disconnected" && (
          <button
            onClick={() => {
              reconnectAttempts.current = 0;
              connect();
            }}
            className="text-[10px] text-primary hover:underline"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Terminal container */}
      <div ref={terminalRef} className="flex-1 terminal-container" />
    </div>
  );
}
