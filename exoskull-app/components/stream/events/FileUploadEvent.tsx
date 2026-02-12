"use client";

import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Film,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, FileUploadData } from "@/lib/stream/types";

interface FileUploadEventProps {
  event: StreamEvent;
}

const fileTypeIcon: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  doc: FileText,
  txt: FileText,
  md: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  pptx: FileText,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  webp: FileImage,
  mp4: Film,
  webm: Film,
  mov: Film,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadEvent({ event }: FileUploadEventProps) {
  const data = event.data as FileUploadData;
  const Icon = fileTypeIcon[data.fileType] || FileText;

  const statusConfig = {
    uploading: { label: "Wgrywanie...", icon: Loader2, color: "text-blue-500" },
    processing: {
      label: "Przetwarzanie...",
      icon: Loader2,
      color: "text-amber-500",
    },
    ready: {
      label: data.chunks ? `Gotowe (${data.chunks} fragmentow)` : "Gotowe",
      icon: CheckCircle2,
      color: "text-green-500",
    },
    failed: {
      label: "Blad przetwarzania",
      icon: XCircle,
      color: "text-red-500",
    },
  };

  const status = statusConfig[data.status];
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 animate-in fade-in duration-300">
      <Icon className="w-8 h-8 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{data.filename}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground uppercase">
            {data.fileType}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatSize(data.fileSize)}
          </span>
        </div>
      </div>
      <div
        className={cn("flex items-center gap-1 text-xs shrink-0", status.color)}
      >
        <StatusIcon
          className={cn(
            "w-3.5 h-3.5",
            data.status === "uploading" || data.status === "processing"
              ? "animate-spin"
              : "",
          )}
        />
        {status.label}
      </div>
    </div>
  );
}
