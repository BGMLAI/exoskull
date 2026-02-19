"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAppStore } from "@/lib/stores/useAppStore";

interface OnboardingBannerProps {
  onStartDiscovery: () => void;
}

/**
 * OnboardingBanner — Dismissible card at top of empty chat for new users.
 */
export function OnboardingBanner({ onStartDiscovery }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    setOnboardingComplete(true);
  };

  return (
    <div className="mx-4 mt-4 p-4 rounded-xl border bg-gradient-to-r from-primary/5 to-accent/5 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-muted text-muted-foreground"
        aria-label="Zamknij"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Witaj w ExoSkull!</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Jestem Twoim drugim mozgiem. Powiedz mi o sobie — co robisz, jakie
            masz cele, co chcesz poprawic. Im wiecej sie dowiem, tym lepiej Ci
            pomoge.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onStartDiscovery}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Zacznijmy!
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Pozniej
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
