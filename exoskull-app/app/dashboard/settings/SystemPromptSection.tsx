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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Code, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export function SystemPromptSection() {
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [override, setOverride] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
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
        setCurrentPrompt(data.systemPromptPreview || "");
        setOverride(data.systemPromptOverride || "");
        if (data.systemPromptOverride) {
          setShowOverride(true);
        }
      } catch (err) {
        console.error("[SystemPromptSection] Load error:", {
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
      const res = await fetch("/api/settings/personality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt_override: override || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[SystemPromptSection] Save error:", {
        error: err instanceof Error ? err.message : err,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setOverride("");
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/settings/personality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt_override: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zresetowac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[SystemPromptSection] Reset error:", {
        error: err instanceof Error ? err.message : err,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  const approxTokens = Math.round((override || currentPrompt).length / 4);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
          <Code className="h-5 w-5" />
          Zaawansowane: System Prompt
        </CardTitle>
        <CardDescription>
          Podglad i nadpisanie system promptu IORS
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ) : (
            <>
              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  Ostroznie — nadpisanie system promptu zastepuje domyslne
                  zachowanie IORS
                </p>
              </div>

              {/* Current prompt preview */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Aktualny prompt (podglad)
                </p>
                <Textarea
                  value={currentPrompt}
                  readOnly
                  className="min-h-[200px] font-mono text-xs bg-muted/50"
                />
              </div>

              {/* Override toggle */}
              {!showOverride ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOverride(true)}
                >
                  Nadpisz prompt
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Nadpisanie (override)
                  </p>
                  <Textarea
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                    placeholder="Wpisz wlasny system prompt..."
                    className="min-h-[200px] font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    ~{approxTokens} tokenow
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              {showOverride && (
                <div className="flex items-center gap-3">
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Zapisywanie..." : "Zapisz override"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetToDefault}
                    disabled={saving}
                  >
                    Resetuj do domyslnego
                  </Button>
                  {saved && (
                    <span className="text-sm text-green-600">Zapisano</span>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
