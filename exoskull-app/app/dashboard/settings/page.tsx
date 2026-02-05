"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IntegrationsWidget } from "@/components/widgets/IntegrationsWidget";
import { EmailInboxWidget } from "@/components/widgets/EmailInboxWidget";
import { COMMUNICATION_STYLE_LABELS, CHANNEL_LABELS } from "@/lib/types/user";
import {
  Settings,
  User,
  Bell,
  Plug,
  Shield,
  CreditCard,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [connections, setConnections] = useState<any[]>([]);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    preferred_name: "",
    communication_style: "",
    preferred_channel: "",
    timezone: "Europe/Warsaw",
    language: "pl",
    morning_checkin_time: "08:00",
    evening_checkin_time: "20:00",
    checkin_enabled: true,
    email: "",
  });

  const [notificationForm, setNotificationForm] =
    useState<NotificationFormState>({
      notification_channels: { voice: true, sms: true },
      quiet_hours: { start: "22:00", end: "07:00" },
      skip_weekends: false,
      rate_limits: { max_calls_per_day: 3, max_sms_per_day: 10 },
    });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);

      const profileRes = await fetch("/api/user/profile");
      const profileJson = await profileRes.json();

      if (!profileRes.ok) {
        throw new Error(profileJson.error || "Nie udalo sie pobrac profilu");
      }

      const profile = profileJson.profile;
      setTenantId(profile.id);

      setProfileForm({
        preferred_name: profile.preferred_name || "",
        communication_style: profile.communication_style || "",
        preferred_channel: profile.preferred_channel || "",
        timezone: profile.timezone || "Europe/Warsaw",
        language: profile.language || "pl",
        morning_checkin_time: profile.morning_checkin_time || "08:00",
        evening_checkin_time: profile.evening_checkin_time || "20:00",
        checkin_enabled: profile.checkin_enabled ?? true,
        email: profile.email || "",
      });

      const scheduleRes = await fetch(`/api/schedule?tenant_id=${profile.id}`);
      const scheduleJson = await scheduleRes.json();

      if (scheduleRes.ok && scheduleJson.global_settings) {
        const settings = scheduleJson.global_settings;

        setNotificationForm({
          notification_channels: {
            voice: settings.notification_channels?.voice ?? true,
            sms: settings.notification_channels?.sms ?? true,
          },
          quiet_hours: {
            start: settings.quiet_hours?.start || "22:00",
            end: settings.quiet_hours?.end || "07:00",
          },
          skip_weekends: settings.skip_weekends ?? false,
          rate_limits: {
            max_calls_per_day: settings.rate_limits?.max_calls_per_day ?? 3,
            max_sms_per_day: settings.rate_limits?.max_sms_per_day ?? 10,
          },
        });
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: rigConnections } = await supabase
          .from("exo_rig_connections")
          .select("rig_slug, sync_status, last_sync_at, metadata")
          .eq("tenant_id", user.id);

        setConnections(rigConnections || []);
      }
    } catch (err) {
      console.error("[SettingsPage] Error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      setSavingProfile(true);
      setProfileSaved(false);

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_name: profileForm.preferred_name,
          communication_style: profileForm.communication_style || null,
          preferred_channel: profileForm.preferred_channel || null,
          timezone: profileForm.timezone,
          language: profileForm.language,
          morning_checkin_time: profileForm.morning_checkin_time,
          evening_checkin_time: profileForm.evening_checkin_time,
          checkin_enabled: profileForm.checkin_enabled,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Nie udalo sie zapisac profilu");
      }

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      console.error("[SettingsPage] Save profile error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveNotifications() {
    if (!tenantId) return;

    try {
      setSavingNotifications(true);
      setNotificationsSaved(false);

      const response = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          global_settings: {
            timezone: profileForm.timezone,
            language: profileForm.language,
            notification_channels: notificationForm.notification_channels,
            rate_limits: {
              max_calls_per_day: Number(
                notificationForm.rate_limits.max_calls_per_day,
              ),
              max_sms_per_day: Number(
                notificationForm.rate_limits.max_sms_per_day,
              ),
            },
            quiet_hours: notificationForm.quiet_hours,
            skip_weekends: notificationForm.skip_weekends,
          },
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Nie udalo sie zapisac ustawien");
      }

      setNotificationsSaved(true);
      setTimeout(() => setNotificationsSaved(false), 2000);
    } catch (err) {
      console.error("[SettingsPage] Save notifications error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSavingNotifications(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Ustawienia
        </h1>
        <p className="text-muted-foreground">
          Zarzadzaj profilem i preferencjami powiadomien
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Profile settings */}
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
                value={profileForm.preferred_name}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    preferred_name: e.target.value,
                  })
                }
                placeholder="Twoje imie"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profileForm.email} disabled />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Styl komunikacji</Label>
              <Select
                value={profileForm.communication_style}
                onValueChange={(value) =>
                  setProfileForm({ ...profileForm, communication_style: value })
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
                value={profileForm.preferred_channel}
                onValueChange={(value) =>
                  setProfileForm({ ...profileForm, preferred_channel: value })
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
                value={profileForm.timezone}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, timezone: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Jezyk</Label>
              <Select
                value={profileForm.language}
                onValueChange={(value) =>
                  setProfileForm({ ...profileForm, language: value })
                }
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
                value={profileForm.morning_checkin_time}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    morning_checkin_time: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evening_checkin_time">Wieczorny check-in</Label>
              <Input
                id="evening_checkin_time"
                type="time"
                value={profileForm.evening_checkin_time}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    evening_checkin_time: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="checkin_enabled"
                type="checkbox"
                className="h-4 w-4"
                checked={profileForm.checkin_enabled}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    checkin_enabled: e.target.checked,
                  })
                }
              />
              <Label htmlFor="checkin_enabled">Wlaczone check-iny</Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Zapisywanie..." : "Zapisz profil"}
            </Button>
            {profileSaved && (
              <span className="text-sm text-green-600">Zapisano</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification preferences */}
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
                    checked={notificationForm.notification_channels.voice}
                    onChange={(e) =>
                      setNotificationForm({
                        ...notificationForm,
                        notification_channels: {
                          ...notificationForm.notification_channels,
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
                    checked={notificationForm.notification_channels.sms}
                    onChange={(e) =>
                      setNotificationForm({
                        ...notificationForm,
                        notification_channels: {
                          ...notificationForm.notification_channels,
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
                  value={notificationForm.quiet_hours.start}
                  onChange={(e) =>
                    setNotificationForm({
                      ...notificationForm,
                      quiet_hours: {
                        ...notificationForm.quiet_hours,
                        start: e.target.value,
                      },
                    })
                  }
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="time"
                  value={notificationForm.quiet_hours.end}
                  onChange={(e) =>
                    setNotificationForm({
                      ...notificationForm,
                      quiet_hours: {
                        ...notificationForm.quiet_hours,
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
                value={notificationForm.rate_limits.max_calls_per_day}
                onChange={(e) =>
                  setNotificationForm({
                    ...notificationForm,
                    rate_limits: {
                      ...notificationForm.rate_limits,
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
                value={notificationForm.rate_limits.max_sms_per_day}
                onChange={(e) =>
                  setNotificationForm({
                    ...notificationForm,
                    rate_limits: {
                      ...notificationForm.rate_limits,
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
                checked={notificationForm.skip_weekends}
                onChange={(e) =>
                  setNotificationForm({
                    ...notificationForm,
                    skip_weekends: e.target.checked,
                  })
                }
              />
              <Label htmlFor="skip_weekends">Pomin weekendy</Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={saveNotifications} disabled={savingNotifications}>
              {savingNotifications ? "Zapisywanie..." : "Zapisz ustawienia"}
            </Button>
            {notificationsSaved && (
              <span className="text-sm text-green-600">Zapisano</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integracje
          </CardTitle>
          <CardDescription>
            Zarzadzaj polaczeniami z zewnetrznymi narzedziami
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationsWidget connections={connections} tenantId={tenantId} />
        </CardContent>
      </Card>

      {/* Privacy & Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Prywatnosc i dane
          </CardTitle>
          <CardDescription>
            Eksport danych, retencja i uprawnienia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Eksport danych (GDPR)</p>
              <p className="text-xs text-muted-foreground">
                Pobierz kopie wszystkich Twoich danych w formacie JSON
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={exportingData}
              onClick={async () => {
                setExportingData(true);
                try {
                  const res = await fetch("/api/user/export");
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `exoskull-data-${new Date().toISOString().split("T")[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } else {
                    console.error("[Settings] Export error:", await res.text());
                  }
                } catch (err) {
                  console.error("[Settings] Export error:", err);
                } finally {
                  setExportingData(false);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {exportingData ? "Eksportowanie..." : "Eksportuj dane"}
            </Button>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="font-medium text-sm">Retencja danych</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nagrania glosowe: 90 dni (potem auto-usuwane) <br />
              Wiadomosci: przechowywane bezterminowo <br />
              Dane zdrowotne: przechowywane bezterminowo <br />
              Dane finansowe: szyfrowane AES-256
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Rozliczenia
          </CardTitle>
          <CardDescription>Plan i platnosci</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Plan: Free</p>
              <p className="text-xs text-muted-foreground">
                Podstawowe funkcje ExoSkull
              </p>
            </div>
            <Badge variant="secondary">Aktywny</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Plany premium beda dostepne wkrotce. Powiadomimy Cie gdy ruszy
            subskrypcja.
          </p>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Konto
          </CardTitle>
          <CardDescription>Niebezpieczne operacje</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
            <div>
              <p className="font-medium text-sm">Usun konto</p>
              <p className="text-xs text-muted-foreground">
                Trwale usunie wszystkie Twoje dane. Tej operacji nie mozna
                cofnac.
              </p>
            </div>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Usun konto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Czy na pewno chcesz usunac konto?</DialogTitle>
                  <DialogDescription>
                    Ta operacja jest nieodwracalna. Wszystkie Twoje dane,
                    rozmowy, zadania i ustawienia zostana trwale usuniete.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                  >
                    Anuluj
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      // Account deletion requires backend support
                      // For now, close dialog and show message
                      setShowDeleteDialog(false);
                      setError("Aby usunac konto, skontaktuj sie z supportem.");
                    }}
                  >
                    Tak, usun moje konto
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Email Inbox - shows when Google or Microsoft connected */}
      <EmailInboxWidget
        tenantId={tenantId}
        rigSlug={
          connections.find(
            (c) => c.rig_slug === "google" && c.sync_status === "success",
          )
            ? "google"
            : connections.find(
                  (c) =>
                    c.rig_slug === "google-workspace" &&
                    c.sync_status === "success",
                )
              ? "google-workspace"
              : connections.find(
                    (c) =>
                      c.rig_slug === "microsoft-365" &&
                      c.sync_status === "success",
                  )
                ? "microsoft-365"
                : "google"
        }
        isConnected={connections.some(
          (c) =>
            ["google", "google-workspace", "microsoft-365"].includes(
              c.rig_slug,
            ) && c.sync_status === "success",
        )}
      />
    </div>
  );
}
