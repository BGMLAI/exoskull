"use client";

import { useState } from "react";
import {
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";
import type { WorkspacePreviewData } from "@/lib/stream/types";

interface WorkspacePreviewProps {
  event: StreamEvent;
}

export function WorkspacePreview({ event }: WorkspacePreviewProps) {
  const data = event.data as WorkspacePreviewData;
  const [expanded, setExpanded] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const title = data.title || data.url || "Preview";

  // Wrap HTML fragments with doctype
  const htmlContent = data.html
    ? data.html.includes("<!DOCTYPE") || data.html.includes("<html")
      ? data.html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body>${data.html}</body></html>`
    : undefined;

  return (
    <div className="my-2 rounded-lg border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <span className="text-xs font-mono text-muted-foreground truncate flex-1">
          {title}
        </span>

        <button
          onClick={() => setIframeKey((k) => k + 1)}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          title="Odśwież"
        >
          <RotateCcw className="w-3 h-3 text-muted-foreground/50" />
        </button>

        {data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-muted/50 transition-colors"
            title="Otwórz w nowej karcie"
          >
            <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
          </a>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
          )}
        </button>
      </div>

      {/* Preview iframe */}
      {expanded && (
        <div className="border-t border-border/40">
          <iframe
            key={iframeKey}
            src={data.url || undefined}
            srcDoc={htmlContent || undefined}
            className="w-full bg-white"
            style={{ height: expanded ? 300 : 0 }}
            sandbox="allow-scripts allow-same-origin"
            title={title}
          />
        </div>
      )}
    </div>
  );
}
