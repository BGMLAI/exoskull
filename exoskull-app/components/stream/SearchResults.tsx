"use client";

/**
 * SearchResults — Perplexity-style search results grid.
 * Displays web search results with thumbnails and source citations.
 */

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  thumbnailUrl?: string;
  favicon?: string;
  siteName?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  query?: string;
  followUpSuggestions?: string[];
  onFollowUp?: (suggestion: string) => void;
  className?: string;
}

export function SearchResults({
  results,
  query,
  followUpSuggestions,
  onFollowUp,
  className,
}: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Query header */}
      {query && (
        <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-wider">
          Wyniki dla: {query}
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-1 gap-2">
        {results.map((result, index) => (
          <a
            key={index}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 rounded-lg border border-cyan-900/20 bg-black/20 p-3 hover:bg-cyan-900/10 hover:border-cyan-800/30 transition-colors group"
          >
            {/* Citation number */}
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-900/30 text-cyan-400 flex items-center justify-center text-[10px] font-mono font-bold mt-0.5">
              {index + 1}
            </div>

            {/* Thumbnail */}
            {result.thumbnailUrl && (
              <img
                src={result.thumbnailUrl}
                alt=""
                className="w-14 h-14 rounded object-cover flex-shrink-0"
                loading="lazy"
              />
            )}

            <div className="flex-1 min-w-0">
              {/* Source */}
              <div className="flex items-center gap-1.5 mb-0.5">
                {result.favicon && (
                  <img
                    src={result.favicon}
                    alt=""
                    className="w-3 h-3 rounded"
                  />
                )}
                <span className="text-[10px] text-cyan-600 truncate">
                  {result.siteName || new URL(result.url).hostname}
                </span>
                <ExternalLink className="w-2.5 h-2.5 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Title */}
              <div className="text-xs font-medium text-white line-clamp-1">
                {result.title}
              </div>

              {/* Snippet */}
              <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                {result.snippet}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Follow-up suggestion chips */}
      {followUpSuggestions && followUpSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {followUpSuggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onFollowUp?.(suggestion)}
              className="px-3 py-1.5 text-[11px] text-cyan-400 bg-cyan-900/15 hover:bg-cyan-900/25 border border-cyan-800/20 rounded-full transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Source citations summary */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[9px] text-slate-600 font-mono">Zrodla:</span>
        <div className="flex gap-1">
          {results.slice(0, 6).map((_, i) => (
            <span
              key={i}
              className="w-4 h-4 rounded-full bg-cyan-900/20 text-cyan-500 flex items-center justify-center text-[8px] font-mono"
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
