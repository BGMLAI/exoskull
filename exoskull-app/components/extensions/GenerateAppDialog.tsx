"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LayoutGrid, AlertCircle, Loader2 } from "lucide-react";

interface GenerateAppDialogProps {
  onGenerated?: () => void;
  trigger?: React.ReactNode;
}

export function GenerateAppDialog({
  onGenerated,
  trigger,
}: GenerateAppDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; slug: string } | null>(
    null,
  );

  async function handleGenerate() {
    if (!description.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const res = await fetch("/api/apps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errorMsg = `Blad serwera (${res.status})`;
        try {
          const data = await res.json();
          errorMsg = data.error || data.details || errorMsg;
        } catch {
          /* non-JSON */
        }
        setError(errorMsg);
        return;
      }

      const data = await res.json();
      setResult({ name: data.app?.name || "App", slug: data.app?.slug || "" });
      setDescription("");
      onGenerated?.();
    } catch (err) {
      clearTimeout(timeout);
      console.error("[GenerateAppDialog] Error:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Generowanie trwa zbyt dlugo. Sprobuj ponownie.");
      } else {
        setError("Blad polaczenia z serwerem");
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setDescription("");
          setError(null);
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <LayoutGrid className="mr-2 h-4 w-4" />
            Buduj Aplikacje
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Buduj Aplikacje AI</DialogTitle>
          <DialogDescription>
            Opisz co chcesz sledzic. AI wygeneruje aplikacje z formularzem i
            wykresami, ktora pojawi sie jako widget na dashboardzie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {result ? (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-4 rounded-md space-y-2">
              <p className="font-medium">
                Aplikacja &ldquo;{result.name}&rdquo; zostala utworzona!
              </p>
              <p className="text-muted-foreground">
                Widget pojawi sie na Twoim dashboardzie. Mozesz go przesunac i
                zmienic rozmiar.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="app-description">Opis aplikacji *</Label>
                <Textarea
                  id="app-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="np. Chce sledzic przeczytane ksiazki — tytul, autor, ocena, data, notatki..."
                  rows={4}
                  disabled={generating}
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {error}
                </div>
              )}
              {generating && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Tworzenie aplikacji... To moze zajac 10-30 sekund.
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          {result ? (
            <Button onClick={() => setIsOpen(false)}>Zamknij</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={generating}
              >
                Anuluj
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || description.trim().length < 5}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generowanie...
                  </>
                ) : (
                  <>
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Buduj
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
