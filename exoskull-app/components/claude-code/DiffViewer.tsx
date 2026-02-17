"use client";

import { cn } from "@/lib/utils";

interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: Array<{ type: "context" | "add" | "remove"; content: string }>;
}

interface DiffViewerProps {
  filePath: string;
  hunks: DiffHunk[];
  className?: string;
}

export function DiffViewer({ filePath, hunks, className }: DiffViewerProps) {
  if (hunks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No changes to display
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b text-xs font-mono text-muted-foreground">
        {filePath}
      </div>

      <div className="font-mono text-xs leading-5">
        {hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} className="border-b border-border/50">
            {/* Hunk header */}
            <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-4 py-0.5 text-[10px]">
              @@ -{hunk.oldStart} +{hunk.newStart} @@
            </div>

            {/* Lines */}
            {hunk.lines.map((line, lineIdx) => (
              <div
                key={lineIdx}
                className={cn(
                  "flex px-4",
                  line.type === "add" &&
                    "bg-green-500/10 text-green-700 dark:text-green-400",
                  line.type === "remove" &&
                    "bg-red-500/10 text-red-700 dark:text-red-400",
                  line.type === "context" && "text-foreground/70",
                )}
              >
                <span className="w-6 shrink-0 select-none text-right pr-2 text-muted-foreground/50">
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                      ? "-"
                      : " "}
                </span>
                <span className="whitespace-pre">{line.content}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
