"use client";

interface EmptyStateProps {
  onQuickAction: (text: string) => void;
}

const QUICK_ACTIONS = [
  "Co wiesz o mnie?",
  "Jaki mam plan na dzis?",
  "Sprawdz moje zdrowie",
  "Zaplanuj moj tydzien",
  "Jakie mam cele?",
  "Co nowego sie nauczyles?",
];

export function EmptyState({ onQuickAction }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold text-muted-foreground mb-2">
          Czesc! Jestem IORS.
        </h2>
        <p className="text-sm text-muted-foreground/70 mb-4">
          Napisz wiadomosc lub kliknij mikrofon, zeby porozmawiac.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {QUICK_ACTIONS.map((prompt) => (
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
