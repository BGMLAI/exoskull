"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Globe,
  Terminal,
  Layout,
  Maximize2,
  Minimize2,
  X,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Monitor,
  Eye,
  MousePointer,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface WorkspacePanel {
  id: string;
  panel_type: string;
  title: string;
  content: string | null;
  url: string | null;
  position: { x: number; y: number; w: number; h: number };
  is_pinned: boolean;
  is_visible: boolean;
}

interface WorkspaceSession {
  id: string;
  status: string;
  browser_url: string | null;
  browser_title: string | null;
  browser_screenshot_url: string | null;
  control_mode: "ai" | "user" | "shared";
  terminal_enabled: boolean;
  terminal_output: string | null;
}

// ============================================================================
// SHARED WORKSPACE COMPONENT
// ============================================================================

export function SharedWorkspace({
  onClose,
  isExpanded,
  onToggleExpand,
}: {
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [panels, setPanels] = useState<WorkspacePanel[]>([]);
  const [activeTab, setActiveTab] = useState<"browser" | "terminal" | "panels">(
    "browser",
  );
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout>();

  // Fetch workspace state
  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setPanels(data.panels || []);
      if (data.session?.browser_url && !urlInput) {
        setUrlInput(data.session.browser_url);
      }
    } catch {
      // Silently ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [urlInput]);

  // Poll for updates every 3s
  useEffect(() => {
    fetchWorkspace();
    pollRef.current = setInterval(fetchWorkspace, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchWorkspace]);

  // Navigate to URL
  const handleNavigate = async (url: string) => {
    if (!url) return;
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    setUrlInput(fullUrl);

    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "navigate", target: fullUrl }),
      });
      const data = await res.json();
      if (data.url) setUrlInput(data.url);
      fetchWorkspace();
    } catch {
      // Ignore
    }
  };

  // Execute terminal command
  const handleTerminal = async () => {
    if (!terminalInput.trim()) return;
    const cmd = terminalInput;
    setTerminalInput("");
    setTerminalHistory((prev) => [...prev, `$ ${cmd}`]);

    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminal", command: cmd }),
      });
      const data = await res.json();
      setTerminalHistory((prev) => [...prev, data.output || "(no output)"]);
    } catch (e) {
      setTerminalHistory((prev) => [
        ...prev,
        `Error: ${e instanceof Error ? e.message : "Unknown"}`,
      ]);
    }

    // Auto-scroll terminal
    setTimeout(() => {
      terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
    }, 100);
  };

  // Toggle control mode
  const handleControlToggle = async () => {
    const newMode = session?.control_mode === "ai" ? "user" : "ai";
    try {
      await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_control", mode: newMode }),
      });
      fetchWorkspace();
    } catch {
      // Ignore
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-[#0a0a0f] border-l border-cyan-900/30 ${
        isExpanded ? "w-full" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d15] border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium text-cyan-300 tracking-wide uppercase">
            Shared Workspace
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Control mode indicator */}
          <button
            onClick={handleControlToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              session?.control_mode === "ai"
                ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
            }`}
            title={
              session?.control_mode === "ai"
                ? "AI controls browser"
                : "You control browser"
            }
          >
            {session?.control_mode === "ai" ? (
              <Eye className="w-3 h-3" />
            ) : (
              <MousePointer className="w-3 h-3" />
            )}
            {session?.control_mode === "ai" ? "AI" : "USER"}
          </button>
          <button
            onClick={onToggleExpand}
            className="p-1 hover:bg-white/5 rounded"
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-cyan-900/20 bg-[#0d0d15]">
        {(
          [
            { key: "browser", icon: Globe, label: "Browser" },
            { key: "terminal", icon: Terminal, label: "Terminal" },
            { key: "panels", icon: Layout, label: "Panels" },
          ] as const
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === key
                ? "text-cyan-300 border-b-2 border-cyan-400 bg-cyan-400/5"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {key === "panels" && panels.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-cyan-500/20 rounded-full text-[10px]">
                {panels.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Initializing workspace...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Browser Tab */}
            {activeTab === "browser" && (
              <div className="flex flex-col h-full">
                {/* URL Bar */}
                <div className="flex items-center gap-2 px-2 py-1.5 bg-[#111118] border-b border-cyan-900/20">
                  <button
                    onClick={() =>
                      fetch("/api/workspace", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "back" }),
                      }).then(() => fetchWorkspace())
                    }
                    className="p-1 hover:bg-white/5 rounded"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={() =>
                      fetch("/api/workspace", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "forward" }),
                      }).then(() => fetchWorkspace())
                    }
                    className="p-1 hover:bg-white/5 rounded"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={() =>
                      fetch("/api/workspace", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "refresh" }),
                      }).then(() => fetchWorkspace())
                    }
                    className="p-1 hover:bg-white/5 rounded"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleNavigate(urlInput);
                    }}
                    className="flex-1"
                  >
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Enter URL or search..."
                      className="w-full px-3 py-1 bg-[#1a1a25] border border-cyan-900/20 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
                    />
                  </form>
                </div>

                {/* Browser content */}
                <div className="flex-1 overflow-auto">
                  {session?.browser_screenshot_url ? (
                    <img
                      src={session.browser_screenshot_url}
                      alt={session.browser_title || "Browser"}
                      className="w-full"
                    />
                  ) : session?.browser_url ? (
                    <div className="flex items-center justify-center h-full text-xs text-gray-500">
                      Loading {session.browser_url}...
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                      <Globe className="w-12 h-12 text-cyan-500/20" />
                      <p className="text-sm text-gray-500">
                        No page loaded yet
                      </p>
                      <p className="text-xs text-gray-600 max-w-xs text-center">
                        Ask IORS to open a URL, or type one above. AI can browse
                        the web and you can watch in real-time.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terminal Tab */}
            {activeTab === "terminal" && (
              <div className="flex flex-col h-full">
                <div
                  ref={terminalRef}
                  className="flex-1 overflow-auto p-3 font-mono text-xs bg-[#0a0a0f]"
                >
                  {terminalHistory.length === 0 &&
                    !session?.terminal_output && (
                      <div className="text-gray-600">
                        <p>ExoSkull VPS Terminal</p>
                        <p className="mt-1">
                          Type a command below or ask IORS to run something.
                        </p>
                        <p className="mt-1 text-cyan-700">$ _</p>
                      </div>
                    )}
                  {session?.terminal_output && terminalHistory.length === 0 && (
                    <pre className="text-green-400 whitespace-pre-wrap">
                      {session.terminal_output}
                    </pre>
                  )}
                  {terminalHistory.map((line, i) => (
                    <pre
                      key={i}
                      className={`whitespace-pre-wrap ${
                        line.startsWith("$")
                          ? "text-cyan-400"
                          : line.startsWith("Error:")
                            ? "text-red-400"
                            : "text-green-400"
                      }`}
                    >
                      {line}
                    </pre>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleTerminal();
                  }}
                  className="flex border-t border-cyan-900/20"
                >
                  <span className="px-2 py-2 text-xs text-cyan-500 font-mono">
                    $
                  </span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Enter command..."
                    className="flex-1 px-1 py-2 bg-transparent text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none"
                  />
                </form>
              </div>
            )}

            {/* Panels Tab */}
            {activeTab === "panels" && (
              <div className="flex-1 overflow-auto p-3">
                {panels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Layout className="w-10 h-10 text-cyan-500/20" />
                    <p className="text-sm text-gray-500">No panels yet</p>
                    <p className="text-xs text-gray-600 max-w-xs text-center">
                      IORS will add panels here: dashboards, documents,
                      visualizations, code previews.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {panels.map((panel) => (
                      <div
                        key={panel.id}
                        className="border border-cyan-900/20 rounded-lg overflow-hidden bg-[#0d0d15]"
                      >
                        {/* Panel header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-[#111118] border-b border-cyan-900/20">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">
                              {panel.panel_type}
                            </span>
                            <span className="text-xs text-gray-300">
                              {panel.title}
                            </span>
                          </div>
                        </div>
                        {/* Panel content */}
                        <div className="p-3 max-h-80 overflow-auto">
                          {panel.url && (
                            <a
                              href={panel.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-cyan-400 hover:underline"
                            >
                              {panel.url}
                            </a>
                          )}
                          {panel.content && (
                            <div
                              className="text-xs text-gray-300 prose prose-invert prose-sm max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: panel.content,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// WORKSPACE TOGGLE BUTTON (for chat sidebar)
// ============================================================================

export function WorkspaceToggle({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
        isOpen
          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
          : "bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10 border border-transparent"
      }`}
      title="Toggle Shared Workspace"
    >
      <Monitor className="w-4 h-4" />
      <span className="hidden sm:inline">Workspace</span>
    </button>
  );
}
