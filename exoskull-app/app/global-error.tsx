"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pl">
      <body className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Coś poszło nie tak</h2>
          <p className="text-gray-400">Błąd został automatycznie zgłoszony.</p>
          <button
            onClick={reset}
            className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 transition"
          >
            Spróbuj ponownie
          </button>
        </div>
      </body>
    </html>
  );
}
