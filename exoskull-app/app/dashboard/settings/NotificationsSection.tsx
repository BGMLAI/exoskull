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
import { Bell } from "lucide-react";

interface NotificationFormState {
  notification_channels: {
    voice: boolean;
    sms: boolean;
  };
  quiet_hours: {
    start: string;
    end: string;
  };
  skip_weekends: boolean;
  rate_limits: {
    max_calls_per_day: number;
    max_sms_per_day: number;
  };
}

interface NotificationsSectionProps {
  form: NotificationFormState;
  setForm: (f: NotificationFormState) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

export function NotificationsSection({
  form,
  setForm,
  onSave,
  saving,
  saved,
}: NotificationsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Powiadomienia
        </CardTitle>
        <CardDescription>Kanaly, godziny ciszy i limity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Kanaly</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.notification_channels.voice}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notification_channels: {
                        ...form.notification_channels,
                        voice: e.target.checked,
                      },
                    })
                  }
                />
                Glos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.notification_channels.sms}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notification_channels: {
                        ...form.notification_channels,
                        sms: e.target.checked,
                      },
                    })
                  }
                />
                SMS
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Godziny ciszy</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={form.quiet_hours.start}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quiet_hours: {
                      ...form.quiet_hours,
                      start: e.target.value,
                    },
                  })
                }
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="time"
                value={form.quiet_hours.end}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quiet_hours: {
                      ...form.quiet_hours,
                      end: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="max_calls">Limit polaczen / dzien</Label>
            <Input
              id="max_calls"
              type="number"
              min="0"
              value={form.rate_limits.max_calls_per_day}
              onChange={(e) =>
                setForm({
                  ...form,
                  rate_limits: {
                    ...form.rate_limits,
                    max_calls_per_day: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_sms">Limit SMS / dzien</Label>
            <Input
              id="max_sms"
              type="number"
              min="0"
              value={form.rate_limits.max_sms_per_day}
              onChange={(e) =>
                setForm({
                  ...form,
                  rate_limits: {
                    ...form.rate_limits,
                    max_sms_per_day: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="skip_weekends"
              type="checkbox"
              className="h-4 w-4"
              checked={form.skip_weekends}
              onChange={(e) =>
                setForm({ ...form, skip_weekends: e.target.checked })
              }
            />
            <Label htmlFor="skip_weekends">Pomin weekendy</Label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz ustawienia"}
          </Button>
          {saved && <span className="text-sm text-green-600">Zapisano</span>}
        </div>
      </CardContent>
    </Card>
  );
}
