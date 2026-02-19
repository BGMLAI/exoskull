"use client";

import { cn } from "@/lib/utils";

interface AppCardProps {
  name: string;
  description?: string;
  icon?: string;
  installed: boolean;
  onOpen?: () => void;
  onToggle?: () => void;
}

export function AppCard({
  name,
  description,
  icon,
  installed,
  onOpen,
  onToggle,
}: AppCardProps) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">
        {icon || "📦"}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm">{name}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {installed && onOpen && (
          <button
            onClick={onOpen}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Otworz
          </button>
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              installed ? "bg-primary" : "bg-muted",
            )}
            aria-label={installed ? "Wylacz" : "Wlacz"}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                installed ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}
