"use client";

import { useState, useCallback } from "react";
import { Copy, Check, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const lines = code.split("\n");
  // Width for line numbers gutter based on total line count
  const gutterWidth = String(lines.length).length;

  return (
    <div className="my-2 rounded-lg border border-zinc-700/50 overflow-hidden bg-zinc-900">
      {/* Top bar: language / filename / copy */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700/50 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          {filename ? (
            <>
              <FileCode className="w-3.5 h-3.5" />
              <span className="font-mono">{filename}</span>
              {language && (
                <span className="text-zinc-500 ml-1">({language})</span>
              )}
            </>
          ) : language ? (
            <span className="font-mono">{language}</span>
          ) : (
            <span className="font-mono text-zinc-500">code</span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="max-h-[400px] overflow-auto">
        <pre className="p-3 text-xs leading-relaxed">
          <code className="font-mono">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                {showLineNumbers && (
                  <span
                    className="select-none text-zinc-600 text-right pr-4 shrink-0"
                    style={{ minWidth: `${gutterWidth + 1}ch` }}
                  >
                    {i + 1}
                  </span>
                )}
                <span className="text-zinc-100 whitespace-pre">{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
