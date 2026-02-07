"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";

interface PersonalityFormState {
  name: string;
  formality: number;
  humor: number;
  directness: number;
  empathy: number;
  detail_level: number;
  proactivity: number;
  language: string;
  communication_hours_start: string;
  communication_hours_end: string;
}

interface PersonalitySectionProps {
  form: PersonalityFormState;
  setForm: (f: PersonalityFormState) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

const PERSONALITY_AXES = [
  {
    key: "formality" as const,
    label: "Formalnosc",
    low: "Luzny",
    high: "Formalny",
  },
  {
    key: "humor" as const,
    label: "Humor",
    low: "Powazny",
    high: "Zabawny",
  },
  {
    key: "directness" as const,
    label: "Bezposredniosc",
    low: "Delikatny",
    high: "Bezposredni",
  },
  {
    key: "empathy" as const,
    label: "Empatia",
    low: "Rzeczowy",
    high: "Empatyczny",
  },
  {
    key: "detail_level" as const,
    label: "Szczegolowos",
    low: "Krotko",
    high: "Dokladnie",
  },
] as const;

export function PersonalitySection({
  form,
  setForm,
  onSave,
  saving,
  saved,
}: PersonalitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Twoj IORS
        </CardTitle>
        <CardDescription>
          Osobowosc i styl komunikacji Twojego IORS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="iors_name">Imie IORS</Label>
            <Input
              id="iors_name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="IORS"
            />
          </div>
          <div className="space-y-2">
            <Label>Jezyk IORS</Label>
            <Select
              value={form.language}
              onValueChange={(value) => setForm({ ...form, language: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (dopasuj do usera)</SelectItem>
                <SelectItem value="pl">Polski</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Proaktywnosc:{" "}
              <span className="font-normal text-muted-foreground">
                {form.proactivity}
              </span>
            </Label>
            <input
              type="range"
              min="0"
              max="100"
              value={form.proactivity}
              onChange={(e) =>
                setForm({ ...form, proactivity: Number(e.target.value) })
              }
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pasywny</span>
              <span>Autonomiczny</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {PERSONALITY_AXES.map((axis) => (
            <div key={axis.key} className="space-y-2">
              <Label>
                {axis.label}:{" "}
                <span className="font-normal text-muted-foreground">
                  {form[axis.key]}
                </span>
              </Label>
              <input
                type="range"
                min="0"
                max="100"
                value={form[axis.key]}
                onChange={(e) =>
                  setForm({ ...form, [axis.key]: Number(e.target.value) })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{axis.low}</span>
                <span>{axis.high}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Godziny komunikacji</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={form.communication_hours_start}
                onChange={(e) =>
                  setForm({
                    ...form,
                    communication_hours_start: e.target.value,
                  })
                }
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="time"
                value={form.communication_hours_end}
                onChange={(e) =>
                  setForm({
                    ...form,
                    communication_hours_end: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz osobowosc"}
          </Button>
          {saved && <span className="text-sm text-green-600">Zapisano</span>}
        </div>
      </CardContent>
    </Card>
  );
}
