"use client";

import { Globe, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, ThirdPartyActionData } from "@/lib/stream/types";

interface ThirdPartyActionProps {
  event: StreamEvent;
}

export function ThirdPartyAction({ event }: ThirdPartyActionProps) {
  const data = event.data as ThirdPartyActionData;

  return (
    <div className="flex justify-center animate-in fade-in duration-300">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs",
          data.success
            ? "bg-muted/50 text-muted-foreground"
            : "bg-red-500/10 text-red-600",
        )}
      >
        <Globe className="w-3 h-3" />
        <span className="font-medium">{data.service}</span>
        <span>{data.action}</span>
        {data.success ? (
          <CheckCircle2 className="w-3 h-3 text-green-500" />
        ) : (
          <XCircle className="w-3 h-3 text-red-500" />
        )}
      </div>
    </div>
  );
}
