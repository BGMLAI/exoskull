"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

interface PresetGroup {
  label: string;
  presets: { key: string; label: string }[];
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    label: "Styl komunikacji",
    presets: [
      {
        key: "motivator",
        label: "Motywator — Zacheca, chwali postepy, podnosi na duchu",
      },
      { key: "coach", label: "Trener — Wymagajacy, rozlicza z commitmentow" },
      {
        key: "analyst",
        label: "Analityk — Dane, statystyki, trendy. Mniej emocji",
      },
      {
        key: "friend",
        label: "Przyjaciel — Ciepły, empatyczny, pyta jak sie czujesz",
      },
    ],
  },
  {
    label: "Proaktywnosc",
    presets: [
      {
        key: "plan_day",
        label: "Planuj moj dzien — Rano plan na podstawie taskow i kalendarza",
      },
      {
        key: "monitor_health",
        label: "Monitoruj zdrowie — Reaguj na spadki snu, energii, nastroju",
      },
      {
        key: "track_goals",
        label: "Pilnuj celow — Co tydzien sprawdzaj postep i przypominaj",
      },
      {
        key: "find_gaps",
        label: "Znajdz luki — Wykrywaj co pomijam i zwracaj uwage",
      },
    ],
  },
  {
    label: "Granice",
    presets: [
      { key: "no_meditation", label: "Nie sugeruj medytacji" },
      { key: "no_finance", label: "Nie mow o finansach" },
      { key: "no_calls", label: "Nie dzwon bez pytania" },
      { key: "weekend_quiet", label: "Weekendy = cisza" },
    ],
  },
];

export function BehaviorPresetsSection() {
  const [activePresets, setActivePresets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/personality");
        if (!res.ok) throw new Error("Nie udalo sie pobrac danych");
        const data = await res.json();
        setActivePresets(data.behaviorPresets || []);
      } catch (err) {
        console.error("[BehaviorPresetsSection] Load error:", {
          error: err instanceof Error ? err.message : err,
        });
        setError(err instanceof Error ? err.message : "Nieznany blad");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function togglePreset(key: string) {
    setActivePresets((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  }

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const res = await fetch("/api/settings/personality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ behavior_presets: activePresets }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[BehaviorPresetsSection] Save error:", {
        error: err instanceof Error ? err.message : err,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Zachowania IORS
        </CardTitle>
        <CardDescription>
          Wybierz zachowania i granice dla Twojego asystenta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {PRESET_GROUPS.map((group) => (
              <div key={group.label} className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.presets.map((preset) => (
                    <label
                      key={preset.key}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={activePresets.includes(preset.key)}
                        onChange={() => togglePreset(preset.key)}
                      />
                      <Label className="cursor-pointer text-sm font-normal">
                        {preset.label}
                      </Label>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz zachowania"}
              </Button>
              {saved && (
                <span className="text-sm text-green-600">Zapisano</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
