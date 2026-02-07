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
import { COMMUNICATION_STYLE_LABELS, CHANNEL_LABELS } from "@/lib/types/user";
import { User } from "lucide-react";

interface ProfileFormState {
  preferred_name: string;
  communication_style: string;
  preferred_channel: string;
  timezone: string;
  language: string;
  morning_checkin_time: string;
  evening_checkin_time: string;
  checkin_enabled: boolean;
  email: string;
}

interface ProfileSectionProps {
  form: ProfileFormState;
  setForm: (f: ProfileFormState) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

export function ProfileSection({
  form,
  setForm,
  onSave,
  saving,
  saved,
}: ProfileSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profil
        </CardTitle>
        <CardDescription>
          Podstawowe dane i preferencje komunikacji
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="preferred_name">Imie</Label>
            <Input
              id="preferred_name"
              value={form.preferred_name}
              onChange={(e) =>
                setForm({ ...form, preferred_name: e.target.value })
              }
              placeholder="Twoje imie"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} disabled />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Styl komunikacji</Label>
            <Select
              value={form.communication_style}
              onValueChange={(value) =>
                setForm({ ...form, communication_style: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz styl" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COMMUNICATION_STYLE_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Preferowany kanal</Label>
            <Select
              value={form.preferred_channel}
              onValueChange={(value) =>
                setForm({ ...form, preferred_channel: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz kanal" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Strefa czasowa</Label>
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Jezyk</Label>
            <Select
              value={form.language}
              onValueChange={(value) => setForm({ ...form, language: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Jezyk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pl">Polski</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="morning_checkin_time">Poranny check-in</Label>
            <Input
              id="morning_checkin_time"
              type="time"
              value={form.morning_checkin_time}
              onChange={(e) =>
                setForm({ ...form, morning_checkin_time: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evening_checkin_time">Wieczorny check-in</Label>
            <Input
              id="evening_checkin_time"
              type="time"
              value={form.evening_checkin_time}
              onChange={(e) =>
                setForm({ ...form, evening_checkin_time: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="checkin_enabled"
              type="checkbox"
              className="h-4 w-4"
              checked={form.checkin_enabled}
              onChange={(e) =>
                setForm({ ...form, checkin_enabled: e.target.checked })
              }
            />
            <Label htmlFor="checkin_enabled">Wlaczone check-iny</Label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz profil"}
          </Button>
          {saved && <span className="text-sm text-green-600">Zapisano</span>}
        </div>
      </CardContent>
    </Card>
  );
}
