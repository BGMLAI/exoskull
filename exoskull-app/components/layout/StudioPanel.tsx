"use client";

/**
 * StudioPanel — AI-generated summaries, notes, and mind map export.
 */

import { useState, useCallback } from "react";
import {
  Brain,
  Download,
  FileJson,
  FileText,
  Sparkles,
  StickyNote,
  RefreshCw,
} from "lucide-react";
import { useMindMapStore } from "@/lib/stores/useMindMapStore";
import { useOrbData } from "@/lib/hooks/useOrbData";
import { cn } from "@/lib/utils";

interface StudioPanelProps {
  tenantId: string;
}

type TabId = "summary" | "notes" | "export";

export function StudioPanel({ tenantId }: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const { rootNodes } = useOrbData();
  const { expandedNodes } = useMindMapStore();

  // Generate AI summary via chat API
  const generateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      // Build context from mind map nodes
      const nodeDescriptions = rootNodes
        .map((n) => {
          const loops = n.children.map((c) => c.label).join(", ");
          return `- ${n.label} (${n.type}, status: ${n.status || "active"})${n.description ? `: ${n.description}` : ""}${loops ? ` [loops: ${loops}]` : ""}`;
        })
        .join("\n");

      const prompt = `Wygeneruj zwiezle podsumowanie mojej mapy mysli w ExoSkull. Mam ${rootNodes.length} glownych wartosci i ${expandedNodes.size} rozwinietych wezlow. Oto struktura:\n\n${nodeDescriptions}\n\nPodsumuj w 3-5 zdaniach: jakie sa glowne obszary, co wyglada na priorytet, i jaka jest sugestia co dalej.`;

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "text_delta" || parsed.type === "content") {
                fullText += parsed.text || parsed.content || "";
                setSummary(fullText);
              } else if (parsed.text) {
                fullText += parsed.text;
                setSummary(fullText);
              }
            } catch {
              // Non-JSON data line, might be raw text
              if (data !== "[DONE]" && data.trim()) {
                fullText += data;
                setSummary(fullText);
              }
            }
          }
        }
      }

      if (!fullText) {
        // Fallback if streaming didn't produce text
        setSummary(
          `**Podsumowanie mapy mysli**\n\n` +
            `- ${rootNodes.length} glownych wartosci\n` +
            `- ${expandedNodes.size} rozwinietych wezlow\n\n` +
            rootNodes
              .map(
                (n) =>
                  `**${n.label}** (${n.children.length} loopow)${n.description ? `: ${n.description}` : ""}`,
              )
              .join("\n"),
        );
      }
    } catch (err) {
      console.error("[StudioPanel] Summary failed:", err);
      // Fallback to local summary on error
      setSummary(
        `**Podsumowanie mapy mysli** (offline)\n\n` +
          `- ${rootNodes.length} glownych wartosci\n` +
          `- ${expandedNodes.size} rozwinietych wezlow\n\n` +
          rootNodes
            .map(
              (n) =>
                `**${n.label}** (${n.children.length} loopow)${n.description ? `: ${n.description}` : ""}`,
            )
            .join("\n"),
      );
    } finally {
      setSummaryLoading(false);
    }
  }, [rootNodes, expandedNodes]);

  // Export mind map as JSON
  const exportJSON = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      nodes: rootNodes.map(function flattenNode(n): Record<string, unknown> {
        return {
          id: n.id,
          label: n.label,
          type: n.type,
          color: n.color,
          status: n.status,
          description: n.description,
          children: n.children.map(flattenNode),
        };
      }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exoskull-mindmap-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rootNodes]);

  // Export as markdown
  const exportMarkdown = useCallback(() => {
    function nodeToMd(
      node: {
        label: string;
        type: string;
        description?: string;
        children: Array<{
          label: string;
          type: string;
          description?: string;
          children: unknown[];
        }>;
      },
      depth: number,
    ): string {
      const indent = "  ".repeat(depth);
      const prefix = depth === 0 ? "#" : "-";
      let line =
        depth === 0
          ? `# ${node.label}\n`
          : `${indent}${prefix} **${node.label}** (${node.type})`;
      if (node.description) line += ` — ${node.description}`;
      line += "\n";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const child of node.children as any[]) {
        line += nodeToMd(child, depth + 1);
      }
      return line;
    }
    const md = rootNodes.map((n) => nodeToMd(n, 0)).join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exoskull-mindmap-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rootNodes]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "summary", label: "Podsumowanie", icon: Sparkles },
    { id: "notes", label: "Notatki", icon: StickyNote },
    { id: "export", label: "Eksport", icon: Download },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 pl-10">
        <h2 className="text-sm font-mono font-semibold text-cyan-400 uppercase tracking-wider mb-3">
          Studio
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 bg-black/30 rounded-lg p-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                  activeTab === tab.id
                    ? "bg-cyan-900/30 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 chat-scroll">
        {/* Summary tab */}
        {activeTab === "summary" && (
          <div>
            <button
              onClick={generateSummary}
              disabled={summaryLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-800/20 rounded-lg text-xs text-cyan-400 transition-colors disabled:opacity-50 mb-4"
            >
              {summaryLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              {summaryLoading ? "Generowanie..." : "Generuj podsumowanie"}
            </button>

            {summary ? (
              <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {summary}
              </div>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">
                  Kliknij przycisk aby wygenerowac
                </p>
                <p className="text-[10px] text-slate-600 mt-1">
                  podsumowanie AI na podstawie mapy
                </p>
              </div>
            )}
          </div>
        )}

        {/* Notes tab */}
        {activeTab === "notes" && (
          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Twoje notatki..."
              className="w-full h-64 bg-black/30 border border-cyan-900/20 rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-700/40 resize-y"
            />
            <p className="text-[10px] text-slate-600 mt-2">
              Notatki zapisuja sie automatycznie w sesji.
            </p>
          </div>
        )}

        {/* Export tab */}
        {activeTab === "export" && (
          <div className="space-y-3">
            <button
              onClick={exportJSON}
              className="w-full flex items-center gap-3 px-4 py-3 bg-black/20 hover:bg-cyan-900/10 border border-cyan-900/20 rounded-lg transition-colors group"
            >
              <div className="p-2 rounded bg-cyan-900/20 text-cyan-500">
                <FileJson className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-medium text-white">
                  Eksport JSON
                </div>
                <div className="text-[10px] text-slate-500">
                  Pelna struktura mapy z metadanymi
                </div>
              </div>
            </button>

            <button
              onClick={exportMarkdown}
              className="w-full flex items-center gap-3 px-4 py-3 bg-black/20 hover:bg-cyan-900/10 border border-cyan-900/20 rounded-lg transition-colors group"
            >
              <div className="p-2 rounded bg-cyan-900/20 text-cyan-500">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-medium text-white">
                  Eksport Markdown
                </div>
                <div className="text-[10px] text-slate-500">
                  Hierarchiczna lista tekstowa
                </div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
