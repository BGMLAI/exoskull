"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Settings, RefreshCw, Check, Loader2 } from "lucide-react";
import { CHANNEL_LABELS } from "@/lib/types/user";

// ============================================================================
// TYPES
// ============================================================================

interface QuickSettings {
  checkin_enabled: boolean;
  morning_checkin_time: string;
  evening_checkin_time: string;
  preferred_channel: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

interface QuickSettingsCardProps {
  tenantId: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function QuickSettingsCard({ tenantId }: QuickSettingsCardProps) {
  const [settings, setSettings] = useState<QuickSettings>({
    checkin_enabled: true,
    morning_checkin_time: "08:00",
    evening_checkin_time: "20:00",
    preferred_channel: "voice",
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current settings
  useEffect(() => {
    async function load() {
      try {
        const [profileRes, scheduleRes] = await Promise.all([
          fetch("/api/user/profile"),
          fetch(`/api/schedule?tenant_id=${tenantId}`),
        ]);

        if (profileRes.ok) {
          const { profile } = await profileRes.json();
          setSettings((prev) => ({
            ...prev,
            checkin_enabled: profile.checkin_enabled ?? true,
            morning_checkin_time: profile.morning_checkin_time || "08:00",
            evening_checkin_time: profile.evening_checkin_time || "20:00",
            preferred_channel: profile.preferred_channel || "voice",
          }));
        }

        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          const gs = scheduleData.global_settings;
          if (gs?.quiet_hours) {
            setSettings((prev) => ({
              ...prev,
              quiet_hours_start: gs.quiet_hours.start || "22:00",
              quiet_hours_end: gs.quiet_hours.end || "07:00",
            }));
          }
        }
      } catch (err) {
        console.error("[QuickSettingsCard] Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [tenantId]);

  // Debounced save
  const saveSettings = useCallback(
    async (newSettings: QuickSettings) => {
      setSaving(true);
      setSaved(false);
      try {
        // Save profile settings
        await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkin_enabled: newSettings.checkin_enabled,
            morning_checkin_time: newSettings.morning_checkin_time,
            evening_checkin_time: newSettings.evening_checkin_time,
            preferred_channel: newSettings.preferred_channel || null,
          }),
        });

        // Save schedule settings (quiet hours)
        await fetch("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            global_settings: {
              quiet_hours: {
                start: newSettings.quiet_hours_start,
                end: newSettings.quiet_hours_end,
              },
            },
          }),
        });

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error("[QuickSettingsCard] Save error:", err);
      } finally {
        setSaving(false);
      }
    },
    [tenantId],
  );

  // Update with debounce
  const updateSetting = useCallback(
    (key: keyof QuickSettings, value: string | boolean) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        saveSettings(newSettings);
      }, 1000);
    },
    [settings, saveSettings],
  );

  // Sync all integrations
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const rigs = ["google", "notion", "todoist", "oura"];
      await Promise.allSettled(
        rigs.map((rig) =>
          fetch(`/api/rigs/${rig}/sync`, { method: "POST" }).catch(() => null),
        ),
      );
    } catch (err) {
      console.error("[QuickSettingsCard] Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Szybkie ustawienia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-full" />
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Szybkie ustawienia
          </CardTitle>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Zapisywanie...
              </span>
            )}
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Zapisano
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Check-in toggle */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Check-iny</Label>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.checkin_enabled}
                  onChange={(e) =>
                    updateSetting("checkin_enabled", e.target.checked)
                  }
                />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm">
                {settings.checkin_enabled ? "Wlaczone" : "Wylaczone"}
              </span>
            </div>
          </div>

          {/* Morning check-in time */}
          <div className="space-y-2">
            <Label
              htmlFor="qs-morning"
              className="text-xs text-muted-foreground"
            >
              Poranny check-in
            </Label>
            <Input
              id="qs-morning"
              type="time"
              value={settings.morning_checkin_time}
              onChange={(e) =>
                updateSetting("morning_checkin_time", e.target.value)
              }
              className="h-9"
              disabled={!settings.checkin_enabled}
            />
          </div>

          {/* Evening check-in time */}
          <div className="space-y-2">
            <Label
              htmlFor="qs-evening"
              className="text-xs text-muted-foreground"
            >
              Wieczorny check-in
            </Label>
            <Input
              id="qs-evening"
              type="time"
              value={settings.evening_checkin_time}
              onChange={(e) =>
                updateSetting("evening_checkin_time", e.target.value)
              }
              className="h-9"
              disabled={!settings.checkin_enabled}
            />
          </div>

          {/* Preferred channel */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Preferowany kanal
            </Label>
            <Select
              value={settings.preferred_channel}
              onValueChange={(value) =>
                updateSetting("preferred_channel", value)
              }
            >
              <SelectTrigger className="h-9">
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

          {/* Quiet hours */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Cisza nocna</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                value={settings.quiet_hours_start}
                onChange={(e) =>
                  updateSetting("quiet_hours_start", e.target.value)
                }
                className="h-9"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="time"
                value={settings.quiet_hours_end}
                onChange={(e) =>
                  updateSetting("quiet_hours_end", e.target.value)
                }
                className="h-9"
              />
            </div>
          </div>

          {/* Sync all button */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Integracje</Label>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9"
              onClick={handleSyncAll}
              disabled={syncing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Synchronizacja..." : "Synchronizuj wszystko"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
