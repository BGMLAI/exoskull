"use client";

import { useState, useCallback } from "react";
import {
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Download,
  ExternalLink,
  X,
  Maximize2,
  FileImage,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, MediaContentData } from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MediaContentProps {
  event: StreamEvent;
}

// ---------------------------------------------------------------------------
// File size formatter
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Media type config
// ---------------------------------------------------------------------------

const MEDIA_CONFIG = {
  image: {
    icon: ImageIcon,
    label: "Obraz",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/5",
    borderColor: "border-indigo-500/15",
  },
  video: {
    icon: Video,
    label: "Film",
    color: "text-rose-500",
    bgColor: "bg-rose-500/5",
    borderColor: "border-rose-500/15",
  },
  document: {
    icon: FileText,
    label: "Dokument",
    color: "text-amber-500",
    bgColor: "bg-amber-500/5",
    borderColor: "border-amber-500/15",
  },
  audio: {
    icon: Music,
    label: "Audio",
    color: "text-green-500",
    bgColor: "bg-green-500/5",
    borderColor: "border-green-500/15",
  },
} as const;

// ---------------------------------------------------------------------------
// Lightbox overlay for images
// ---------------------------------------------------------------------------

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image renderer with preview + lightbox
// ---------------------------------------------------------------------------

function ImageRenderer({ data }: { data: MediaContentData }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
        <FileImage className="w-5 h-5 text-muted-foreground/50" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            Nie udało się załadować obrazu
          </p>
          {data.title && (
            <p className="text-[10px] text-muted-foreground/50">{data.title}</p>
          )}
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-border/30 max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.thumbnailUrl || data.url}
          alt={data.title || data.caption || "Image"}
          className="max-w-full max-h-80 object-contain bg-muted/20"
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
          onError={() => setImgError(true)}
        />

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Maximize2 className="w-5 h-5 text-white drop-shadow-lg" />
        </div>

        {/* Caption overlay */}
        {data.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
            <p className="text-[11px] text-white/90 line-clamp-2">
              {data.caption}
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          src={data.url}
          alt={data.title || "Image"}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Video renderer with player
// ---------------------------------------------------------------------------

function VideoRenderer({ data }: { data: MediaContentData }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border/30 max-w-lg">
      <video
        src={data.url}
        controls
        preload="metadata"
        poster={data.thumbnailUrl}
        className="max-w-full max-h-[400px] bg-black"
        {...(data.dimensions
          ? { width: data.dimensions.width, height: data.dimensions.height }
          : {})}
      >
        Twoja przeglądarka nie obsługuje odtwarzania wideo.
      </video>
      {data.caption && (
        <div className="px-3 py-1.5 bg-muted/20 border-t border-border/20">
          <p className="text-[11px] text-muted-foreground">{data.caption}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio renderer
// ---------------------------------------------------------------------------

function AudioRenderer({ data }: { data: MediaContentData }) {
  return (
    <div className="rounded-lg border border-border/30 overflow-hidden max-w-md">
      <div className="px-3 py-2 flex items-center gap-2 bg-muted/20">
        <Music className="w-4 h-4 text-green-500 flex-shrink-0" />
        <span className="text-xs font-medium truncate">
          {data.title || "Audio"}
        </span>
      </div>
      <div className="px-3 py-2">
        <audio
          src={data.url}
          controls
          preload="metadata"
          className="w-full h-8"
        >
          Twoja przeglądarka nie obsługuje odtwarzania audio.
        </audio>
      </div>
      {data.caption && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground/70">{data.caption}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document renderer (PDF preview / download link)
// ---------------------------------------------------------------------------

function DocumentRenderer({ data }: { data: MediaContentData }) {
  const isPdf =
    data.mimeType === "application/pdf" || data.url.endsWith(".pdf");

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden max-w-md">
      {/* PDF inline preview */}
      {isPdf && (
        <iframe
          src={`${data.url}#toolbar=0&navpanes=0`}
          className="w-full h-[300px] border-b border-border/20"
          title={data.title || "PDF Preview"}
        />
      )}

      {/* Document info bar */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/20">
        <FileText className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {data.title || "Dokument"}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {data.mimeType && (
              <span className="text-[10px] text-muted-foreground/60">
                {data.mimeType.split("/").pop()?.toUpperCase()}
              </span>
            )}
            {data.fileSize && (
              <span className="text-[10px] text-muted-foreground/50">
                {formatFileSize(data.fileSize)}
              </span>
            )}
          </div>
          {data.caption && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">
              {data.caption}
            </p>
          )}
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors flex-shrink-0"
          title="Pobierz"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MediaContent({ event }: MediaContentProps) {
  const data = event.data as MediaContentData;
  const config = MEDIA_CONFIG[data.mediaType];

  return (
    <div className="animate-in fade-in duration-200 space-y-1.5 max-w-[95%]">
      {/* Title if present and not just an image */}
      {data.title && data.mediaType !== "image" && (
        <div className="flex items-center gap-1.5">
          <config.icon className={cn("w-3.5 h-3.5", config.color)} />
          <span className="text-xs font-medium text-foreground/80">
            {data.title}
          </span>
          {data.fileSize && (
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              {formatFileSize(data.fileSize)}
            </span>
          )}
        </div>
      )}

      {/* Render based on media type */}
      {data.mediaType === "image" && <ImageRenderer data={data} />}
      {data.mediaType === "video" && <VideoRenderer data={data} />}
      {data.mediaType === "audio" && <AudioRenderer data={data} />}
      {data.mediaType === "document" && <DocumentRenderer data={data} />}
    </div>
  );
}
