"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";

interface GenerateSkillDialogProps {
  onGenerated?: () => void;
  trigger?: React.ReactNode;
}

export function GenerateSkillDialog({
  onGenerated,
  trigger,
}: GenerateSkillDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!description.trim()) return;

    setGenerating(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const res = await fetch("/api/skills/generate", {
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
      setIsOpen(false);
      setDescription("");
      onGenerated?.();

      if (data.skill?.id) {
        router.push(`/dashboard/skills/${data.skill.id}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error("[GenerateSkillDialog] Error:", err);
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
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Sparkles className="mr-2 h-4 w-4" />
            Generuj Skill
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Generuj nowy Skill</DialogTitle>
          <DialogDescription>
            Opisz co chcesz sledzic lub automatyzowac. AI wygeneruje kod, ktory
            przejdzie walidacje i bedzie czekac na Twoje zatwierdzenie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="skill-description">Opis skilla *</Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="np. Chce sledzic ile wody wypijam dziennie - szklanki, czas, cel 8 szklanek..."
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
              Generowanie kodu... To moze zajac 10-30 sekund.
            </div>
          )}
        </div>
        <DialogFooter>
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
                <Sparkles className="mr-2 h-4 w-4" />
                Generuj
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
