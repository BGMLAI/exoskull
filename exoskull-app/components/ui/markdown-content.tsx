"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

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
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="bg-black/10 dark:bg-white/10 px-1 rounded text-xs">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
