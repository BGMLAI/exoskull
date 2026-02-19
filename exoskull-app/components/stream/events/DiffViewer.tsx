/**
 * DiffViewer — Renders a unified diff view in the stream.
 *
 * Shows file path header, hunks with context/add/remove lines,
 * and line numbers for both old and new files.
 */
"use client";

import { useState } from "react";
import { Check, Copy, FileDiff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, DiffViewData } from "@/lib/stream/types";

interface DiffViewerProps {
  event: StreamEvent;
}

export function DiffViewer({ event }: DiffViewerProps) {
  const data = event.data as DiffViewData;
  const [copied, setCopied] = useState(false);

  // Build unified diff text for copy
  const diffText = data.hunks
    .flatMap((h) =>
      h.lines.map((l) => {
        if (l.type === "add") return `+ ${l.content}`;
        if (l.type === "remove") return `- ${l.content}`;
        return `  ${l.content}`;
      }),
    )
    .join("\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(diffText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div className="max-w-2xl rounded-lg overflow-hidden border border-border/60 bg-[#1e1e2e] dark:bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] dark:bg-[#0a0e14] border-b border-border/30">
        <div className="flex items-center gap-2">
          <FileDiff className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-gray-400 font-mono">
            {data.filePath}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Skopiowano</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Kopiuj</span>
            </>
          )}
        </button>
      </div>

      {/* Diff hunks */}
      <div className="overflow-x-auto">
        <pre className="text-xs leading-5 p-0">
          <code>
            {data.hunks.map((hunk, hi) => {
              let oldLine = hunk.oldStart;
              let newLine = hunk.newStart;

              return (
                <div key={hi}>
                  {/* Hunk separator */}
                  {hi > 0 && (
                    <div className="text-center text-[10px] text-gray-600 py-0.5 bg-[#161622]">
                      ···
                    </div>
                  )}
                  {hunk.lines.map((line, li) => {
                    const oldNum = line.type === "add" ? "" : String(oldLine++);
                    const newNum =
                      line.type === "remove" ? "" : String(newLine++);

                    return (
                      <div
                        key={`${hi}-${li}`}
                        className={cn(
                          "flex",
                          line.type === "add" &&
                            "bg-green-500/10 border-l-2 border-green-500",
                          line.type === "remove" &&
                            "bg-red-500/10 border-l-2 border-red-500",
                        )}
                      >
                        {/* Old line number */}
                        <span className="select-none text-gray-600 text-right pr-1 pl-2 w-8 inline-block flex-shrink-0 font-mono">
                          {oldNum}
                        </span>
                        {/* New line number */}
                        <span className="select-none text-gray-600 text-right pr-3 w-8 inline-block flex-shrink-0 font-mono">
                          {newNum}
                        </span>
                        {/* Diff marker */}
                        <span
                          className={cn(
                            "w-4 text-center flex-shrink-0 font-mono select-none",
                            line.type === "add" && "text-green-400",
                            line.type === "remove" && "text-red-400",
                            line.type === "context" && "text-gray-600",
                          )}
                        >
                          {line.type === "add"
                            ? "+"
                            : line.type === "remove"
                              ? "-"
                              : " "}
                        </span>
                        {/* Content */}
                        <span
                          className={cn(
                            "pr-4 whitespace-pre font-mono",
                            line.type === "add" && "text-green-300",
                            line.type === "remove" && "text-red-300",
                            line.type === "context" && "text-gray-300",
                          )}
                        >
                          {line.content || " "}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
