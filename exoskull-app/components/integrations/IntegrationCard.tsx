"use client";

import { cn } from "@/lib/utils";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { useState } from "react";

interface IntegrationCardProps {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  hasOAuth: boolean;
  connected: boolean;
  onConnect: (slug: string) => void;
}

export function IntegrationCard({
  slug,
  name,
  description,
  icon,
  category,
  hasOAuth,
  connected,
  onConnect,
}: IntegrationCardProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      onConnect(slug);
    } finally {
      // onConnect may redirect — if not, reset after timeout
      setTimeout(() => setConnecting(false), 5000);
    }
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{name}</h3>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {category}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>
      <div className="shrink-0">
        {connected ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check className="w-3.5 h-3.5" />
            Polaczony
          </span>
        ) : hasOAuth ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {connecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ExternalLink className="w-3 h-3" />
            )}
            Polacz
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            Wymaga bridge
          </span>
        )}
      </div>
    </div>
  );
}
