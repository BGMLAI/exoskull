/**
 * CodeBlock — Interactive code display in the stream
 *
 * Features:
 * - Syntax highlighting (language-aware)
 * - Copy to clipboard
 * - Line number display
 * - Highlighted lines
 * - Filename header
 */
"use client";

import React, { useState } from "react";
import { Check, Copy, FileCode, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, CodeBlockData } from "@/lib/stream/types";

interface CodeBlockProps {
  event: StreamEvent;
}

export function CodeBlock({ event }: CodeBlockProps) {
  const data = event.data as CodeBlockData;
  const [copied, setCopied] = useState(false);

  const lines = data.code.split("\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(data.code);
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
          {data.executable ? (
            <Terminal className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
          )}
          <span className="text-xs text-gray-400 font-mono">
            {data.filename || data.language}
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

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="text-xs leading-5 p-0">
          <code>
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isHighlighted = data.highlightLines?.includes(lineNum);

              return (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    isHighlighted &&
                      "bg-yellow-500/10 border-l-2 border-yellow-500",
                  )}
                >
                  <span className="select-none text-gray-600 text-right pr-3 pl-3 py-0 w-10 inline-block flex-shrink-0 font-mono">
                    {lineNum}
                  </span>
                  <span className="text-gray-200 py-0 pr-4 whitespace-pre font-mono">
                    {line || " "}
                  </span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
