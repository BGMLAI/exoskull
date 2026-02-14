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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain } from "lucide-react";

interface AIConfig {
  temperature: number;
  tts_speed: number;
  model_preferences: {
    chat: string;
    analysis: string;
    coding: string;
    creative: string;
    crisis: string;
  };
}

interface UsageSummary {
  today_cost_cents: number;
  daily_budget_cents: number;
  per_model: { model: string; cost_cents: number; requests: number }[];
}

const MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  chat: [
    { label: "Auto", value: "auto" },
    { label: "Gemini Flash", value: "gemini-flash" },
    { label: "Gemini Pro", value: "gemini-pro" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus 4.6", value: "opus" },
  ],
  analysis: [
    { label: "Auto", value: "auto" },
    { label: "Gemini Flash", value: "gemini-flash" },
    { label: "Gemini Pro", value: "gemini-pro" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus 4.6", value: "opus" },
  ],
  coding: [
    { label: "Auto", value: "auto" },
    { label: "Codex 5.2", value: "codex" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus 4.6", value: "opus" },
  ],
  creative: [
    { label: "Auto", value: "auto" },
    { label: "Gemini Pro", value: "gemini-pro" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus 4.6", value: "opus" },
  ],
  crisis: [
    { label: "Auto", value: "auto" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus 4.6", value: "opus" },
  ],
};

const TASK_LABELS: Record<string, string> = {
  chat: "Chat",
  analysis: "Analiza",
  coding: "Kodowanie",
  creative: "Kreatywne",
  crisis: "Kryzys",
};

const MODEL_COLORS: Record<string, string> = {
  "gemini-flash":
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "gemini-pro":
    "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  codex: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  sonnet:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  opus: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  // Legacy keys (still used in usage tracking)
  flash: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  haiku: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
};

export function AIConfigSection() {
  const [config, setConfig] = useState<AIConfig>({
    temperature: 0.7,
    tts_speed: 1.0,
    model_preferences: {
      chat: "auto",
      analysis: "auto",
      coding: "auto",
      creative: "auto",
      crisis: "auto",
    },
  });
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/ai-config");
        if (!res.ok) throw new Error("Nie udalo sie pobrac konfiguracji AI");
        const data = await res.json();
        if (data.config) {
          setConfig({
            temperature: data.config.temperature ?? 0.7,
            tts_speed: data.config.tts_speed ?? 1.0,
            model_preferences: {
              chat: data.config.model_preferences?.chat || "auto",
              analysis: data.config.model_preferences?.analysis || "auto",
              coding: data.config.model_preferences?.coding || "auto",
              creative: data.config.model_preferences?.creative || "auto",
              crisis: data.config.model_preferences?.crisis || "auto",
            },
          });
        }
        if (data.usage) {
          setUsage({
            today_cost_cents: data.usage.today_cost_cents ?? 0,
            daily_budget_cents: data.usage.daily_budget_cents ?? 0,
            per_model: Array.isArray(data.usage.per_model)
              ? data.usage.per_model
              : [],
          });
        }
      } catch (err) {
        console.error("[AIConfigSection] Load error:", {
          error: err instanceof Error ? err.message : err,
        });
        setError(err instanceof Error ? err.message : "Nieznany blad");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const res = await fetch("/api/settings/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[AIConfigSection] Save error:", {
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
          <Brain className="h-5 w-5" />
          Konfiguracja AI
        </CardTitle>
        <CardDescription>
          Temperatura, predkosc mowy i wybor modeli per zadanie
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Temperature */}
            <div className="space-y-2">
              <Label>
                Temperatura:{" "}
                <span className="font-normal text-muted-foreground">
                  {config.temperature.toFixed(1)}
                </span>
              </Label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Przewidywalny</span>
                <span>Kreatywny</span>
              </div>
            </div>

            {/* TTS Speed */}
            <div className="space-y-2">
              <Label>
                Predkosc mowy:{" "}
                <span className="font-normal text-muted-foreground">
                  {config.tts_speed.toFixed(1)}x
                </span>
              </Label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={config.tts_speed}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tts_speed: parseFloat(e.target.value),
                  })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Wolno</span>
                <span>Szybko</span>
              </div>
            </div>

            {/* Model per task */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Model per zadanie
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(MODEL_OPTIONS).map(([task, options]) => (
                  <div key={task} className="space-y-1">
                    <Label className="text-sm">{TASK_LABELS[task]}</Label>
                    <Select
                      value={
                        config.model_preferences[
                          task as keyof typeof config.model_preferences
                        ]
                      }
                      onValueChange={(value) =>
                        setConfig({
                          ...config,
                          model_preferences: {
                            ...config.model_preferences,
                            [task]: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Usage (read-only) */}
            {usage && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Uzycie AI dzisiaj
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      ${(usage.today_cost_cents / 100).toFixed(2)} / $
                      {(usage.daily_budget_cents / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      {usage.daily_budget_cents > 0
                        ? Math.round(
                            (usage.today_cost_cents /
                              usage.daily_budget_cents) *
                              100,
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <Progress
                    value={
                      usage.daily_budget_cents > 0
                        ? Math.min(
                            100,
                            (usage.today_cost_cents /
                              usage.daily_budget_cents) *
                              100,
                          )
                        : 0
                    }
                    className="h-2"
                  />
                </div>
                {usage.per_model.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {usage.per_model.map((m) => (
                      <Badge
                        key={m.model}
                        variant="secondary"
                        className={MODEL_COLORS[m.model] || ""}
                      >
                        {m.model}: ${(m.cost_cents / 100).toFixed(2)} (
                        {m.requests} req)
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz konfiguracje"}
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
