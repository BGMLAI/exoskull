"use client";

import { useRef, useCallback } from "react";
import { ExternalLink, RefreshCw, Globe } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewTabProps {
  /** URL to load in iframe (src mode) */
  url: string | null;
  /** HTML string to render in iframe (srcdoc mode) */
  html: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewTab({ url, html }: PreviewTabProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      if (url) {
        iframeRef.current.src = url;
      } else if (html) {
        iframeRef.current.srcdoc = wrapHtml(html);
      }
    }
  }, [url, html]);

  const handleOpenExternal = useCallback(() => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (html) {
      const blob = new Blob([wrapHtml(html)], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  }, [url, html]);

  const hasContent = url || html;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 shrink-0">
        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate">
          {url || (html ? "inline preview" : "no content")}
        </span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Refresh"
          disabled={!hasContent}
        >
          <RefreshCw className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={handleOpenExternal}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Open in new tab"
          disabled={!hasContent}
        >
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white dark:bg-gray-950">
        {!hasContent ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No preview content
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            {...(url ? { src: url } : { srcDoc: wrapHtml(html!) })}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML wrapper with CSP
// ---------------------------------------------------------------------------

function wrapHtml(raw: string): string {
  // If the HTML already has a <html> tag, inject CSP meta
  if (raw.includes("<html") || raw.includes("<!DOCTYPE")) {
    return raw;
  }

  // Wrap in a basic HTML document with CSP
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; font-src * data:;" />
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
${raw}
</body>
</html>`;
}
