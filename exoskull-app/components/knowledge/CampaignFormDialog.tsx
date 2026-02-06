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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Campaign, CreateCampaignInput, Loop } from "@/lib/types/knowledge";
import { toast } from "sonner";

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign; // undefined = create mode
  loops: Loop[];
  defaultLoopSlug?: string;
  onSave: (input: CreateCampaignInput) => Promise<void>;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  loops,
  defaultLoopSlug,
  onSave,
}: CampaignFormDialogProps) {
  const [title, setTitle] = useState("");
  const [vision, setVision] = useState("");
  const [loopSlug, setLoopSlug] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate form when editing or reset for create
  useEffect(() => {
    if (campaign) {
      setTitle(campaign.title);
      setVision(campaign.vision || "");
      setLoopSlug(campaign.loop_slug || "");
      setStartDate(campaign.start_date?.split("T")[0] || "");
      setTargetDate(campaign.target_date?.split("T")[0] || "");
    } else {
      setTitle("");
      setVision("");
      setLoopSlug(defaultLoopSlug || "");
      setStartDate("");
      setTargetDate("");
    }
  }, [campaign, defaultLoopSlug, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        vision: vision.trim() || undefined,
        loopSlug: loopSlug || undefined,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[CampaignFormDialog] Save error:", err);
      toast.error(err instanceof Error ? err.message : "Blad zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Edytuj Kampanie" : "Nowa Kampania"}
          </DialogTitle>
          <DialogDescription>
            Kampania to duza inicjatywa skladajaca sie z wielu Questow
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Tytul</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Transformacja zdrowotna Q1"
                required
              />
            </div>

            {/* Vision */}
            <div className="grid gap-2">
              <Label htmlFor="vision">Wizja</Label>
              <Textarea
                id="vision"
                value={vision}
                onChange={(e) => setVision(e.target.value)}
                placeholder="Co chcesz osiagnac? Jaki jest cel koncowy?"
                rows={3}
              />
            </div>

            {/* Loop selection */}
            <div className="grid gap-2">
              <Label>Loop (obszar)</Label>
              <Select value={loopSlug} onValueChange={setLoopSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz loop..." />
                </SelectTrigger>
                <SelectContent>
                  {loops.map((loop) => (
                    <SelectItem key={loop.slug} value={loop.slug}>
                      {loop.icon} {loop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Data startu</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="targetDate">Data docelowa</Label>
                <Input
                  id="targetDate"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
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
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Zapisywanie..." : campaign ? "Zapisz" : "Utworz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
