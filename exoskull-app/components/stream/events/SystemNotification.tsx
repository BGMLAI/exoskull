"use client";

import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ListTodo,
  Lightbulb,
  Heart,
  Mail,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, SystemNotificationData } from "@/lib/stream/types";

interface SystemNotificationProps {
  event: StreamEvent;
}

// Severity-based config (fallback)
const severityConfig = {
  info: {
    bg: "bg-muted/50",
    border: "border-muted-foreground/20",
    text: "text-muted-foreground",
    icon: Bell,
  },
  success: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-700 dark:text-green-400",
    icon: CheckCircle2,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
};

// Category-based overrides (more specific colors)
const categoryConfig: Record<
  string,
  { bg: string; border: string; text: string; icon: typeof Bell }
> = {
  task: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-400/40",
    text: "text-blue-700 dark:text-blue-400",
    icon: ListTodo,
  },
  insight: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-400/40",
    text: "text-purple-700 dark:text-purple-400",
    icon: Lightbulb,
  },
  alert: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-400/40",
    text: "text-red-700 dark:text-red-400",
    icon: AlertTriangle,
  },
  health: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-400/40",
    text: "text-green-700 dark:text-green-400",
    icon: Heart,
  },
  email: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-400/40",
    text: "text-amber-700 dark:text-amber-400",
    icon: Mail,
  },
  system: {
    bg: "bg-gray-50 dark:bg-gray-950/30",
    border: "border-gray-400/30",
    text: "text-gray-600 dark:text-gray-400",
    icon: Zap,
  },
};

// Detect category from message content
function detectCategory(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("zadani") || lower.includes("task")) return "task";
  if (lower.includes("insight") || lower.includes("wzorzec")) return "insight";
  if (
    lower.includes("alert") ||
    lower.includes("uwaga") ||
    lower.includes("pilne")
  )
    return "alert";
  if (
    lower.includes("health") ||
    lower.includes("zdrowi") ||
    lower.includes("sen")
  )
    return "health";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  return null;
}

export function SystemNotification({ event }: SystemNotificationProps) {
  const data = event.data as SystemNotificationData;

  // Try category-based config first, then fall back to severity
  const category = detectCategory(data.message);
  const catConfig = category ? categoryConfig[category] : null;
  const sevConfig = severityConfig[data.severity];

  const config = catConfig || sevConfig;
  const Icon = config.icon;

  return (
    <div className="flex justify-center animate-in fade-in duration-300">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border",
          config.bg,
          config.border,
          config.text,
        )}
      >
        <Icon className="w-3 h-3" />
        {data.message}
      </div>
    </div>
  );
}
