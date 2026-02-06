"use client";

/**
 * VoiceHero — Voice-first hero section for the dashboard.
 *
 * Shows a LARGE prominent voice button + quick status bar.
 * This is the PRIMARY interaction point — voice is the main interface.
 */

import { useState, useEffect } from "react";
import { Mic, Zap, Brain, CheckSquare, Phone } from "lucide-react";
import { VoiceInterface } from "@/components/voice/VoiceInterface";

interface VoiceHeroProps {
  tenantId: string;
  assistantName: string;
  phoneNumber?: string;
}

interface QuickStats {
  energy: number | null;
  mood: string | null;
  pendingTasks: number;
  nextAction: string | null;
}

export function VoiceHero({
  tenantId,
  assistantName,
  phoneNumber,
}: VoiceHeroProps) {
  const [stats, setStats] = useState<QuickStats>({
    energy: null,
    mood: null,
    pendingTasks: 0,
    nextAction: null,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/pulse");
        if (res.ok) {
          const data = await res.json();
          setStats({
            energy: data.lastCheckin?.energy ?? null,
            mood: data.lastCheckin?.mood ?? null,
            pendingTasks: data.pendingTasks ?? 0,
            nextAction: data.nextAction ?? null,
          });
        }
      } catch {
        // Stats are optional — don't block UI
      }
    }
    loadStats();
  }, []);

  return (
    <div className="p-4 space-y-4">
      {/* Voice Hero — the PRIMARY CTA, big and prominent */}
      <div className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 dark:from-blue-600/20 dark:to-purple-600/20 rounded-2xl p-8 flex flex-col items-center text-center border border-blue-200/30 dark:border-blue-800/30">
        <h2 className="text-lg font-semibold mb-1">
          Porozmawiaj z {assistantName}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Dodaj task, sprawdz cele, zaplanuj dzien — glosem
        </p>

        {/* Voice interface — inline, bigger */}
        <div className="scale-125 mb-4">
          <VoiceInterface tenantId={tenantId} position="inline" />
        </div>

        {/* Alternative: phone call */}
        {phoneNumber && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Phone className="w-3 h-3" />
            lub zadzwon:{" "}
            <a href={`tel:${phoneNumber}`} className="underline">
              {phoneNumber}
            </a>
          </p>
        )}
      </div>

      {/* Quick Status Bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stats.energy !== null && (
          <StatusChip
            icon={<Zap className="w-3.5 h-3.5 text-yellow-500" />}
            label={`Energia ${stats.energy}/10`}
          />
        )}
        {stats.mood && (
          <StatusChip
            icon={<Brain className="w-3.5 h-3.5 text-purple-500" />}
            label={stats.mood}
          />
        )}
        {stats.pendingTasks > 0 && (
          <StatusChip
            icon={<CheckSquare className="w-3.5 h-3.5 text-blue-500" />}
            label={`${stats.pendingTasks} taskow`}
          />
        )}
        {stats.nextAction && (
          <StatusChip
            icon={<Mic className="w-3.5 h-3.5 text-green-500" />}
            label={stats.nextAction}
          />
        )}
      </div>
    </div>
  );
}

function StatusChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card border rounded-full text-xs text-muted-foreground whitespace-nowrap">
      {icon}
      <span>{label}</span>
    </div>
  );
}
