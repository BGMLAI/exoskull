"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Terminal, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalOutputProps {
  command?: string;
  output: string;
  exitCode?: number;
}

export function TerminalOutput({
  command,
  output,
  exitCode,
}: TerminalOutputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = command ? `$ ${command}\n${output}` : output;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [command, output]);

  const isSuccess = exitCode === undefined || exitCode === 0;

  return (
    <div className="my-2 rounded-lg border border-zinc-700/50 overflow-hidden bg-zinc-950">
      {/* Terminal header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          {/* Fake window dots */}
          <div className="flex items-center gap-1">
            <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500" />
            <Circle className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
            <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-zinc-500 ml-1" />
          <span className="text-xs text-zinc-500 font-mono">terminal</span>
        </div>
        <div className="flex items-center gap-2">
          {exitCode !== undefined && (
            <span
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded",
                isSuccess
                  ? "bg-green-500/15 text-green-400 border border-green-500/20"
                  : "bg-red-500/15 text-red-400 border border-red-500/20",
              )}
            >
              exit {exitCode}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
            title="Copy output"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="max-h-[300px] overflow-auto p-3">
        <pre className="text-xs font-mono leading-relaxed">
          {command && (
            <div className="mb-1">
              <span className="text-green-400 select-none">$ </span>
              <span className="text-zinc-100">{command}</span>
            </div>
          )}
          <div className="text-zinc-400 whitespace-pre-wrap">{output}</div>
        </pre>
      </div>
    </div>
  );
}
