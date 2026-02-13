"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { Copy, Check, ExternalLink } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
      title="Kopiuj"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-400" />
      )}
    </button>
  );
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i;

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "text-sm prose prose-sm dark:prose-invert max-w-none",
        className,
      )}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-1">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          h1: ({ children }) => (
            <p className="font-bold text-base mb-1">{children}</p>
          ),
          h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
          h3: ({ children }) => (
            <p className="font-semibold mb-0.5">{children}</p>
          ),
          a: ({ href, children }) => {
            // Render image URLs inline
            if (href && IMAGE_EXTENSIONS.test(href)) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block my-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={href}
                    alt={typeof children === "string" ? children : "image"}
                    className="max-w-full rounded-lg max-h-80 object-contain"
                    loading="lazy"
                  />
                </a>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                {children}
                <ExternalLink className="w-3 h-3 inline opacity-50" />
              </a>
            );
          },
          img: ({ src, alt }) => (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block my-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt || "image"}
                className="max-w-full rounded-lg max-h-80 object-contain"
                loading="lazy"
              />
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-t">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border/50" />,
          code: ({ className: codeClassName, children }) => {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const codeStr = String(children).replace(/\n$/, "");
            const isBlock = match || codeStr.includes("\n");

            if (isBlock) {
              return (
                <div className="relative my-2 rounded-lg overflow-hidden">
                  {match && (
                    <div className="bg-[#282c34] text-[10px] text-gray-400 px-3 py-1 border-b border-white/5">
                      {match[1]}
                    </div>
                  )}
                  <CopyButton text={codeStr} />
                  <SyntaxHighlighter
                    style={oneDark as Record<string, React.CSSProperties>}
                    language={match?.[1] || "text"}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: "0.75rem 1rem",
                      fontSize: "0.75rem",
                      lineHeight: "1.5",
                      borderRadius: match ? "0 0 0.5rem 0.5rem" : "0.5rem",
                    }}
                  >
                    {codeStr}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return (
              <code className="bg-black/10 dark:bg-white/10 px-1 rounded text-xs">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
