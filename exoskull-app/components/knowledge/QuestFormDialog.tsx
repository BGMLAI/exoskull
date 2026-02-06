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
import { Quest, CreateQuestInput, Loop, Campaign } from "@/lib/types/knowledge";
import { toast } from "sonner";

interface QuestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quest?: Quest; // undefined = create mode
  loops: Loop[];
  campaigns: Campaign[];
  defaultCampaignId?: string;
  defaultLoopSlug?: string;
  onSave: (input: CreateQuestInput) => Promise<void>;
}

export function QuestFormDialog({
  open,
  onOpenChange,
  quest,
  loops,
  campaigns,
  defaultCampaignId,
  defaultLoopSlug,
  onSave,
}: QuestFormDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [loopSlug, setLoopSlug] = useState("");
  const [targetOps, setTargetOps] = useState<number | undefined>(undefined);
  const [deadline, setDeadline] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate form when editing or reset for create
  useEffect(() => {
    if (quest) {
      setTitle(quest.title);
      setDescription(quest.description || "");
      setCampaignId(quest.campaign_id || "");
      setLoopSlug(quest.loop_slug || "");
      setTargetOps(quest.target_ops || undefined);
      setDeadline(quest.deadline?.split("T")[0] || "");
      setTagsInput(quest.tags?.join(", ") || "");
    } else {
      setTitle("");
      setDescription("");
      setCampaignId(defaultCampaignId || "");
      setLoopSlug(defaultLoopSlug || "");
      setTargetOps(undefined);
      setDeadline("");
      setTagsInput("");
    }
  }, [quest, defaultCampaignId, defaultLoopSlug, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        campaignId: campaignId || undefined,
        loopSlug: loopSlug || undefined,
        targetOps: targetOps || undefined,
        deadline: deadline || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[QuestFormDialog] Save error:", err);
      toast.error(err instanceof Error ? err.message : "Blad zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{quest ? "Edytuj Quest" : "Nowy Quest"}</DialogTitle>
          <DialogDescription>
            Quest to projekt skladajacy sie z konkretnych zadan (Ops)
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
                placeholder="np. Wdrozenie porannej rutyny"
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Co chcesz osiagnac w tym quescie?"
                rows={2}
              />
            </div>

            {/* Campaign & Loop selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kampania</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Brak</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Loop</Label>
                <Select value={loopSlug} onValueChange={setLoopSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Brak</SelectItem>
                    {loops.map((loop) => (
                      <SelectItem key={loop.slug} value={loop.slug}>
                        {loop.icon} {loop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target ops & Deadline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="targetOps">Cel (ilosc ops)</Label>
                <Input
                  id="targetOps"
                  type="number"
                  min={1}
                  value={targetOps || ""}
                  onChange={(e) =>
                    setTargetOps(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="np. 10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            {/* Tags */}
            <div className="grid gap-2">
              <Label htmlFor="tags">Tagi (oddzielone przecinkami)</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="np. zdrowie, nawyki, priorytet"
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
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Zapisywanie..." : quest ? "Zapisz" : "Utworz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
