"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loop, CreateLoopInput, DEFAULT_LOOPS } from "@/lib/types/knowledge";
import { toast } from "sonner";

interface LoopFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loop?: Loop; // undefined = create mode
  onSave: (input: CreateLoopInput) => Promise<void>;
}

const EMOJI_OPTIONS = [
  "🏥",
  "💼",
  "👥",
  "💰",
  "🌱",
  "🎨",
  "🎮",
  "📚",
  "🏋️",
  "🧘",
  "🎯",
  "🔧",
  "🌍",
  "🎵",
  "🍳",
];
const COLOR_OPTIONS = [
  "#10B981",
  "#3B82F6",
  "#EC4899",
  "#F59E0B",
  "#8B5CF6",
  "#F472B6",
  "#22D3EE",
  "#EF4444",
  "#84CC16",
];

export function LoopFormDialog({
  open,
  onOpenChange,
  loop,
  onSave,
}: LoopFormDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [color, setColor] = useState("#3B82F6");
  const [priority, setPriority] = useState(5);
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (loop) {
      setName(loop.name);
      setSlug(loop.slug);
      setDescription(loop.description || "");
      setIcon(loop.icon || "🎯");
      setColor(loop.color || "#3B82F6");
      setPriority(loop.priority);
    } else {
      // Reset for create mode
      setName("");
      setSlug("");
      setDescription("");
      setIcon("🎯");
      setColor("#3B82F6");
      setPriority(5);
    }
  }, [loop, open]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!loop) {
      const generatedSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(generatedSlug);
    }
  }, [name, loop]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        icon,
        color,
        priority,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[LoopFormDialog] Save error:", err);
      toast.error(err instanceof Error ? err.message : "Blad zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{loop ? "Edytuj Loop" : "Nowy Loop"}</DialogTitle>
          <DialogDescription>
            Loop to obszar zycia (np. Zdrowie, Praca, Relacje)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Nazwa</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Zdrowie"
                required
              />
            </div>

            {/* Slug */}
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="np. health"
                pattern="[a-z0-9-]+"
                required
                disabled={!!loop}
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Krotki opis obszaru..."
                rows={2}
              />
            </div>

            {/* Icon picker */}
            <div className="grid gap-2">
              <Label>Ikona</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`text-2xl p-1 rounded border-2 transition-all ${
                      icon === emoji
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-muted"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div className="grid gap-2">
              <Label>Kolor</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="grid gap-2">
              <Label htmlFor="priority">Priorytet (1-10)</Label>
              <Input
                id="priority"
                type="number"
                min={1}
                max={10}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !slug.trim()}
            >
              {saving ? "Zapisywanie..." : loop ? "Zapisz" : "Utworz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
