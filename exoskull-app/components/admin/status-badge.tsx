"use client";

import { Badge } from "@/components/ui/badge";

type StatusType = "success" | "warning" | "error" | "info" | "neutral";

const STATUS_STYLES: Record<StatusType, string> = {
  success: "bg-green-500/10 text-green-500 border-green-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  neutral: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

interface StatusBadgeProps {
  status: StatusType;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

/**
 * Convert common status strings to StatusType
 */
export function getStatusType(status: string): StatusType {
  switch (status) {
    case "completed":
    case "success":
    case "healthy":
    case "active":
      return "success";
    case "running":
    case "pending":
    case "syncing":
      return "info";
    case "slow":
    case "degraded":
    case "warning":
      return "warning";
    case "failed":
    case "error":
    case "critical":
      return "error";
    default:
      return "neutral";
  }
}
