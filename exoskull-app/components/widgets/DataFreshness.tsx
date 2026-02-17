"use client";

import { cn } from "@/lib/utils";

interface DataFreshnessProps {
  timestamp?: string | null;
  className?: string;
}

/**
 * Tiny indicator showing when widget data was last fetched.
 * Color shifts from muted → yellow → red based on staleness.
 */
export function DataFreshness({ timestamp, className }: DataFreshnessProps) {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  const color =
    diffMin > 30
      ? "text-red-500"
      : diffMin > 10
        ? "text-yellow-600 dark:text-yellow-500"
        : "text-muted-foreground";

  const time = date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span
      className={cn("text-xs", color, className)}
      title={date.toLocaleString("pl-PL")}
    >
      {time}
    </span>
  );
}
