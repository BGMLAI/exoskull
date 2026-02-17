"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  filename: string;
  diff: string;
  language?: string;
}

interface DiffLine {
  type: "added" | "removed" | "context" | "header";
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

function parseDiff(diff: string): DiffLine[] {
  const rawLines = diff.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    if (raw.startsWith("@@")) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({
        type: "header",
        content: raw,
        oldLineNum: null,
        newLineNum: null,
      });
    } else if (raw.startsWith("+")) {
      result.push({
        type: "added",
        content: raw.slice(1),
        oldLineNum: null,
        newLineNum: newLine,
      });
      newLine++;
    } else if (raw.startsWith("-")) {
      result.push({
        type: "removed",
        content: raw.slice(1),
        oldLineNum: oldLine,
        newLineNum: null,
      });
      oldLine++;
    } else if (raw.startsWith(" ")) {
      result.push({
        type: "context",
        content: raw.slice(1),
        oldLineNum: oldLine,
        newLineNum: newLine,
      });
      oldLine++;
      newLine++;
    }
    // Skip lines that don't match diff format (like "---", "+++", "diff --git", etc.)
  }

  return result;
}

export function DiffViewer({ filename, diff, language }: DiffViewerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const lines = useMemo(() => parseDiff(diff), [diff]);

  const addedCount = lines.filter((l) => l.type === "added").length;
  const removedCount = lines.filter((l) => l.type === "removed").length;

  return (
    <div className="my-2 rounded-lg border border-zinc-700/50 overflow-hidden bg-zinc-900">
      {/* File header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-2 bg-zinc-800 border-b border-zinc-700/50 text-xs hover:bg-zinc-750 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-300">
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <FileCode className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono">{filename}</span>
          {language && <span className="text-zinc-500 ml-1">({language})</span>}
        </div>
        <div className="flex items-center gap-2">
          {addedCount > 0 && (
            <span className="text-green-400 font-mono">+{addedCount}</span>
          )}
          {removedCount > 0 && (
            <span className="text-red-400 font-mono">-{removedCount}</span>
          )}
        </div>
      </button>

      {/* Diff content */}
      {!collapsed && (
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {lines.map((line, i) => {
                if (line.type === "header") {
                  return (
                    <tr key={i} className="bg-blue-500/10">
                      <td
                        colSpan={3}
                        className="px-3 py-1 text-blue-400 select-none"
                      >
                        {line.content}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={i}
                    className={cn(
                      line.type === "added" && "bg-green-500/10",
                      line.type === "removed" && "bg-red-500/10",
                    )}
                  >
                    {/* Old line number */}
                    <td className="w-[1%] whitespace-nowrap text-right pr-1 pl-2 py-0 select-none text-zinc-600 border-r border-zinc-800">
                      {line.oldLineNum ?? ""}
                    </td>
                    {/* New line number */}
                    <td className="w-[1%] whitespace-nowrap text-right pr-2 pl-1 py-0 select-none text-zinc-600 border-r border-zinc-800">
                      {line.newLineNum ?? ""}
                    </td>
                    {/* Content */}
                    <td
                      className={cn(
                        "px-3 py-0 whitespace-pre",
                        line.type === "added" && "text-green-400",
                        line.type === "removed" && "text-red-400",
                        line.type === "context" && "text-zinc-300",
                      )}
                    >
                      <span className="select-none mr-2 text-zinc-600">
                        {line.type === "added"
                          ? "+"
                          : line.type === "removed"
                            ? "-"
                            : " "}
                      </span>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
