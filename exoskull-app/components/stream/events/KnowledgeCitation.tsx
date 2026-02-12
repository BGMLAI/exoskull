"use client";

import { BookOpen } from "lucide-react";
import type { StreamEvent, KnowledgeCitationData } from "@/lib/stream/types";

interface KnowledgeCitationProps {
  event: StreamEvent;
}

export function KnowledgeCitation({ event }: KnowledgeCitationProps) {
  const data = event.data as KnowledgeCitationData;

  return (
    <div className="animate-in fade-in duration-300">
      <blockquote className="pl-3 border-l-2 border-l-primary/50 bg-primary/5 rounded-r-lg p-2">
        <div className="flex items-center gap-1.5 mb-1">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">
            {data.documentName}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {Math.round(data.relevanceScore * 100)}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground italic">{data.snippet}</p>
      </blockquote>
    </div>
  );
}
