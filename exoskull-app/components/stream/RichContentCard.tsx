"use client";

/**
 * RichContentCard — Gemini-style polymorphic card for rich media content.
 * Renders different layouts based on content type.
 */

import { useState } from "react";
import { ExternalLink, Copy, Check, Maximize2, X, Box } from "lucide-react";
import { cn } from "@/lib/utils";

export type RichContentType = "image" | "article" | "code" | "model3d";

interface BaseCardData {
  type: RichContentType;
  title?: string;
}

interface ImageCardData extends BaseCardData {
  type: "image";
  imageUrl: string;
  caption?: string;
  alt?: string;
}

interface ArticleCardData extends BaseCardData {
  type: "article";
  url: string;
  favicon?: string;
  snippet?: string;
  siteName?: string;
  thumbnailUrl?: string;
}

interface CodeCardData extends BaseCardData {
  type: "code";
  code: string;
  language?: string;
}

interface Model3DCardData extends BaseCardData {
  type: "model3d";
  modelUrl: string;
  thumbnailUrl?: string;
}

export type RichCardData =
  | ImageCardData
  | ArticleCardData
  | CodeCardData
  | Model3DCardData;

interface RichContentCardProps {
  data: RichCardData;
  className?: string;
}

export function RichContentCard({ data, className }: RichContentCardProps) {
  switch (data.type) {
    case "image":
      return <ImageCard data={data} className={className} />;
    case "article":
      return <ArticleCard data={data} className={className} />;
    case "code":
      return <CodeCard data={data} className={className} />;
    case "model3d":
      return <Model3DCard data={data} className={className} />;
    default:
      return null;
  }
}

// ── Image Card ──

function ImageCard({
  data,
  className,
}: {
  data: ImageCardData;
  className?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "rounded-lg overflow-hidden border border-cyan-900/20 bg-black/20 group",
          className,
        )}
      >
        <div className="relative">
          <img
            src={data.imageUrl}
            alt={data.alt || data.caption || ""}
            className="w-full max-h-80 object-cover"
            loading="lazy"
          />
          <button
            onClick={() => setFullscreen(true)}
            className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {data.caption && (
          <div className="px-3 py-2 text-xs text-slate-400">{data.caption}</div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8"
          onClick={() => setFullscreen(false)}
        >
          <button className="absolute top-4 right-4 p-2 text-white hover:text-cyan-400">
            <X className="w-6 h-6" />
          </button>
          <img
            src={data.imageUrl}
            alt={data.alt || ""}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}

// ── Article Card (Perplexity-style) ──

function ArticleCard({
  data,
  className,
}: {
  data: ArticleCardData;
  className?: string;
}) {
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex gap-3 rounded-lg border border-cyan-900/20 bg-black/20 p-3 hover:bg-cyan-900/10 hover:border-cyan-800/30 transition-colors group",
        className,
      )}
    >
      {/* Thumbnail */}
      {data.thumbnailUrl && (
        <img
          src={data.thumbnailUrl}
          alt=""
          className="w-16 h-16 rounded object-cover flex-shrink-0"
          loading="lazy"
        />
      )}

      <div className="flex-1 min-w-0">
        {/* Site name + favicon */}
        <div className="flex items-center gap-1.5 mb-1">
          {data.favicon && (
            <img src={data.favicon} alt="" className="w-3.5 h-3.5 rounded" />
          )}
          <span className="text-[10px] text-cyan-500 truncate">
            {data.siteName || new URL(data.url).hostname}
          </span>
          <ExternalLink className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Title */}
        <div className="text-xs font-medium text-white line-clamp-1">
          {data.title || data.url}
        </div>

        {/* Snippet */}
        {data.snippet && (
          <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
            {data.snippet}
          </div>
        )}
      </div>
    </a>
  );
}

// ── Code Card ──

function CodeCard({
  data,
  className,
}: {
  data: CodeCardData;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-cyan-900/20 bg-[#0a0a1a] overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 border-b border-cyan-900/10">
        <span className="text-[10px] font-mono text-cyan-500 uppercase">
          {data.language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="p-1 rounded text-slate-500 hover:text-white transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Code */}
      <pre className="px-3 py-2.5 text-xs font-mono text-slate-300 overflow-x-auto max-h-60">
        <code>{data.code}</code>
      </pre>
    </div>
  );
}

// ── Model 3D Card ──

function Model3DCard({
  data,
  className,
}: {
  data: Model3DCardData;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-cyan-900/20 bg-black/20 overflow-hidden",
        className,
      )}
    >
      {data.thumbnailUrl ? (
        <img
          src={data.thumbnailUrl}
          alt={data.title || "3D Model"}
          className="w-full h-40 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-40 flex items-center justify-center bg-[#0a0a1a]">
          <Box className="w-10 h-10 text-cyan-800" />
        </div>
      )}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-white font-medium truncate">
          {data.title || "3D Model"}
        </span>
        <span className="text-[9px] font-mono text-cyan-600 uppercase">
          glTF
        </span>
      </div>
    </div>
  );
}
