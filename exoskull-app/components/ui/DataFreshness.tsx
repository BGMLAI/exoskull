"use client";

import { useState, useEffect } from "react";

interface DataFreshnessProps {
  lastRefreshed: Date | null;
  onRefresh?: () => void;
}

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "przed chwil\u0105";
  if (diffMin === 1) return "1 min temu";
  if (diffMin < 60) return `${diffMin} min temu`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "1 godz. temu";
  return `${diffH} godz. temu`;
}

export function DataFreshness({
  lastRefreshed,
  onRefresh,
}: DataFreshnessProps) {
  const [, setTick] = useState(0);

  // Re-render every 30 seconds to keep the relative time fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!lastRefreshed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        \u0141adowanie...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span>Ostatnia aktualizacja: {formatAge(lastRefreshed)}</span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center justify-center rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Od\u015bwie\u017c dane"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
        </button>
      )}
    </span>
  );
}
