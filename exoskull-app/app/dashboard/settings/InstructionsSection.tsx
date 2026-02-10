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
import { FileText } from "lucide-react";

export function InstructionsSection() {
  const [instructions, setInstructions] = useState("");
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
        setInstructions(data.customInstructions || "");
      } catch (err) {
        console.error("[InstructionsSection] Load error:", {
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
        body: JSON.stringify({ custom_instructions: instructions }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[InstructionsSection] Save error:", {
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
          <FileText className="h-5 w-5" />
          Instrukcje dla IORS
        </CardTitle>
        <CardDescription>
          Instrukcje maja najwyzszy priorytet — IORS zawsze je respektuje.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Textarea
                value={instructions}
                onChange={(e) => {
                  if (e.target.value.length <= 2000) {
                    setInstructions(e.target.value);
                  }
                }}
                placeholder="Np. Zawsze przypominaj mi o piciu wody. Nie sugeruj medytacji. Mow do mnie po imieniu."
                className="min-h-[120px]"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {instructions.length} / 2000
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz instrukcje"}
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
