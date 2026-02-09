"use client";

import { Bell, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, SystemNotificationData } from "@/lib/stream/types";

interface SystemNotificationProps {
  event: StreamEvent;
}

const severityConfig = {
  info: {
    bg: "bg-muted/50",
    text: "text-muted-foreground",
    icon: Bell,
  },
  success: {
    bg: "bg-green-500/10",
    text: "text-green-700 dark:text-green-400",
    icon: CheckCircle2,
  },
  warning: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
};

export function SystemNotification({ event }: SystemNotificationProps) {
  const data = event.data as SystemNotificationData;
  const config = severityConfig[data.severity];
  const Icon = config.icon;

  return (
    <div className="flex justify-center animate-in fade-in duration-300">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs",
          config.bg,
          config.text,
        )}
      >
        <Icon className="w-3 h-3" />
        {data.message}
      </div>
    </div>
  );
}
