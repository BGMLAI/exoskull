"use client";

import { useEffect, useState } from "react";

interface Stats {
  users: number;
  conversations: number;
  interventions_delivered: number;
}

export function SocialProof() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats || (stats.users === 0 && stats.conversations === 0)) return null;

  const items = [
    { value: stats.users, label: "uzytkownikow" },
    { value: stats.conversations, label: "rozmow" },
    { value: stats.interventions_delivered, label: "akcji AI" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex justify-center gap-8 md:gap-12 py-8">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="text-3xl md:text-4xl font-bold text-white">
            {item.value > 999
              ? `${(item.value / 1000).toFixed(1)}k`
              : item.value}
          </div>
          <div className="text-sm text-slate-500 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
