"use client";

import { useState } from "react";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";
import type { WorkspaceTerminalData } from "@/lib/stream/types";

interface WorkspaceTerminalProps {
  event: StreamEvent;
}

export function WorkspaceTerminal({ event }: WorkspaceTerminalProps) {
  const data = event.data as WorkspaceTerminalData;
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="my-2 rounded-lg border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <Terminal className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="text-xs font-mono text-muted-foreground flex-1 text-left">
          {data.initialCommand || "Terminal"}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </button>

      {/* Output */}
      {expanded && data.output && (
        <div className="border-t border-border/40 bg-[#0d1117]">
          <pre className="p-3 text-xs font-mono text-emerald-300/80 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {data.initialCommand && (
              <span className="text-cyan-400/70">
                $ {data.initialCommand}
                {"\n"}
              </span>
            )}
            {data.output}
          </pre>
        </div>
      )}
    </div>
  );
}
