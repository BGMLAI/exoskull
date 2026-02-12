"use client";

import {
  Wrench,
  Hammer,
  Zap,
  Blocks,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, SystemEvolutionData } from "@/lib/stream/types";

interface SystemEvolutionProps {
  event: StreamEvent;
}

const EVOLUTION_ICONS: Record<string, React.ElementType> = {
  build: Hammer,
  fix: Wrench,
  optimize: Zap,
  register_tool: Blocks,
};

const EVOLUTION_LABELS: Record<string, string> = {
  build: "Zbudowano",
  fix: "Naprawiono",
  optimize: "Zoptymalizowano",
  register_tool: "Nowe narzędzie",
};

const EVOLUTION_COLORS: Record<string, string> = {
  build: "border-emerald-500 bg-emerald-500/5",
  fix: "border-amber-500 bg-amber-500/5",
  optimize: "border-blue-500 bg-blue-500/5",
  register_tool: "border-violet-500 bg-violet-500/5",
};

const ICON_COLORS: Record<string, string> = {
  build: "text-emerald-500",
  fix: "text-amber-500",
  optimize: "text-blue-500",
  register_tool: "text-violet-500",
};

export function SystemEvolution({ event }: SystemEvolutionProps) {
  const data = event.data as SystemEvolutionData;
  const Icon = EVOLUTION_ICONS[data.evolutionType] || Wrench;
  const label = EVOLUTION_LABELS[data.evolutionType] || data.evolutionType;
  const borderColor =
    EVOLUTION_COLORS[data.evolutionType] || "border-muted bg-muted/5";
  const iconColor = ICON_COLORS[data.evolutionType] || "text-muted-foreground";

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
      <div className={cn("border-l-4 rounded-lg p-3 max-w-[85%]", borderColor)}>
        <div className="flex items-start gap-2.5">
          <div className={cn("mt-0.5 flex-shrink-0", iconColor)}>
            <Icon className="w-4 h-4" />
          </div>

          <div className="space-y-1 min-w-0 flex-1">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  iconColor,
                )}
              >
                {label}
              </span>
              <OutcomeBadge outcome={data.outcome} />
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-foreground">{data.title}</p>

            {/* Description */}
            <p className="text-xs text-muted-foreground">{data.description}</p>

            {/* Related entity tag */}
            {data.relatedEntity && (
              <span className="inline-block text-[10px] text-muted-foreground/60 bg-muted rounded px-1.5 py-0.5">
                {data.relatedEntity}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "success":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500">
          <CheckCircle2 className="w-3 h-3" />
          OK
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
          <XCircle className="w-3 h-3" />
          Błąd
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />W toku
        </span>
      );
    default:
      return null;
  }
}
