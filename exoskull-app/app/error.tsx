"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Cos poszlo nie tak</h1>
        <p className="text-muted-foreground">
          Wystapil nieoczekiwany blad. Sprobuj ponownie.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Ref: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 transition"
          >
            Sprobuj ponownie
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted transition"
          >
            Wroc do dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
