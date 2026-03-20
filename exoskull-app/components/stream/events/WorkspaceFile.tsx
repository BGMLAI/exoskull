"use client";

import { useState } from "react";
import { FileCode, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";
import type { WorkspaceFileData } from "@/lib/stream/types";

interface WorkspaceFileProps {
  event: StreamEvent;
}

export function WorkspaceFile({ event }: WorkspaceFileProps) {
  const data = event.data as WorkspaceFileData;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const filename = data.filePath.split("/").pop() || data.filePath;
  const lang = data.language || filename.split(".").pop() || "text";

  const handleCopy = () => {
    if (data.content) {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-xs font-mono text-muted-foreground truncate flex-1 text-left">
          {data.filePath}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50 uppercase">
          {lang}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </button>

      {/* Content */}
      {expanded && data.content && (
        <div className="relative border-t border-border/40">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-muted/50 hover:bg-muted transition-colors z-10"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
          <pre className="p-3 text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto text-foreground/90 leading-relaxed">
            <code>{data.content}</code>
          </pre>
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && data.content && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] font-mono text-muted-foreground/60 truncate">
            {data.content.split("\n").slice(0, 2).join(" ")}
          </pre>
        </div>
      )}
    </div>
  );
}
