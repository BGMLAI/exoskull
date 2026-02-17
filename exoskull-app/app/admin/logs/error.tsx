"use client";

import { useEffect } from "react";

export default function LogsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin][LogsError]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center h-full min-h-[50vh] p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Blad ladowania logow</h2>
        <p className="text-muted-foreground text-sm">
          Nie udalo sie zaladowac logow. Sprobuj ponownie.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 transition"
        >
          Sprobuj ponownie
        </button>
      </div>
    </div>
  );
}
