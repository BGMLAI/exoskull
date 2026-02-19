/**
 * FileChangeEvent — Displays a file operation notification in the stream.
 *
 * Shows file path, operation type (write/edit/create), and language badge.
 */
"use client";

import { FileCode, FilePlus, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, FileChangeData } from "@/lib/stream/types";

interface FileChangeEventProps {
  event: StreamEvent;
}

const OP_CONFIG = {
  create: {
    icon: FilePlus,
    label: "Utworzono",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  write: {
    icon: FileCode,
    label: "Zapisano",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  edit: {
    icon: FileEdit,
    label: "Edytowano",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
} as const;

export function FileChangeEvent({ event }: FileChangeEventProps) {
  const data = event.data as FileChangeData;
  const config = OP_CONFIG[data.operation] || OP_CONFIG.edit;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md border text-sm",
        config.bg,
        config.border,
      )}
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0", config.color)} />
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        <span className="text-xs text-foreground font-mono truncate">
          {data.filePath}
        </span>
      </div>
      {data.language && (
        <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded flex-shrink-0">
          {data.language}
        </span>
      )}
    </div>
  );
}
