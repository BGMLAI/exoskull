"use client";

import { useAppStore } from "@/lib/stores/useAppStore";
import { OnboardingBanner } from "@/components/conversation/OnboardingBanner";
import { useEffect, useState } from "react";

interface EmptyStateProps {
  onQuickAction: (text: string) => void;
}

// Default fallback when no goals loaded yet
const DEFAULT_ACTIONS = [
  "Co wiesz o mnie?",
  "Jakie mam cele?",
  "Zaplanuj mój tydzień",
];

export function EmptyState({ onQuickAction }: EmptyStateProps) {
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const [quickActions, setQuickActions] = useState<string[]>(DEFAULT_ACTIONS);

  // A3: Load adaptive quick actions based on user's actual goals
  useEffect(() => {
    async function loadGoalActions() {
      try {
        const res = await fetch("/api/v3/quick-actions");
        if (res.ok) {
          const data = await res.json();
          if (data.actions?.length > 0) {
            setQuickActions(data.actions);
          }
        }
      } catch {
        // Keep defaults on error
      }
    }
    if (onboardingComplete) {
      loadGoalActions();
    }
  }, [onboardingComplete]);

  return (
    <div className="flex flex-col items-center justify-center h-full">
      {/* Onboarding banner for new users */}
      {!onboardingComplete && (
        <OnboardingBanner
          onStartDiscovery={() =>
            onQuickAction(
              "Cześć! Opowiedz mi o sobie — kim jesteś i czym się zajmujesz?",
            )
          }
        />
      )}

      <div className="text-center max-w-md mt-8">
        <h2 className="text-xl font-semibold text-muted-foreground mb-2">
          Cześć! Jestem IORS.
        </h2>
        <p className="text-sm text-muted-foreground/70 mb-4">
          Napisz wiadomość lub kliknij mikrofon, żeby porozmawiać.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {quickActions.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onQuickAction(prompt)}
              className="px-3 py-1.5 text-xs rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
