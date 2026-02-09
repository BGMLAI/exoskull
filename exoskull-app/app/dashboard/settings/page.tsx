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
import { IntegrationsWidget } from "@/components/widgets/IntegrationsWidget";
import { EmailInboxWidget } from "@/components/widgets/EmailInboxWidget";
import {
  Settings,
  Shield,
  CreditCard,
  Trash2,
  Download,
  AlertTriangle,
  Plug,
  Puzzle,
  Sparkles,
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
import { ProfileSection } from "./ProfileSection";
import { PersonalitySection } from "./PersonalitySection";
import { NotificationsSection } from "./NotificationsSection";

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
  const [activeMods, setActiveMods] = useState<any[]>([]);
  const [activeSkills, setActiveSkills] = useState<any[]>([]);

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

  const [personalityForm, setPersonalityForm] = useState<PersonalityFormState>({
    name: "IORS",
    formality: 30,
    humor: 40,
    directness: 70,
    empathy: 60,
    detail_level: 40,
    proactivity: 50,
    language: "auto",
    communication_hours_start: "07:00",
    communication_hours_end: "23:00",
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPersonality, setSavingPersonality] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [autonomyPermissions, setAutonomyPermissions] = useState<
    Array<{
      action_type: string;
      domain: string;
      granted: boolean;
      requires_confirmation: boolean;
      threshold_amount?: number;
    }>
  >([]);
  const [autonomyLoading, setAutonomyLoading] = useState(false);

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

      const p = profile.iors_personality;
      if (p) {
        setPersonalityForm({
          name: profile.iors_name || p.name || "IORS",
          formality: p.style?.formality ?? 30,
          humor: p.style?.humor ?? 40,
          directness: p.style?.directness ?? 70,
          empathy: p.style?.empathy ?? 60,
          detail_level: p.style?.detail_level ?? 40,
          proactivity: p.proactivity ?? 50,
          language: p.language || "auto",
          communication_hours_start: p.communication_hours?.start || "07:00",
          communication_hours_end: p.communication_hours?.end || "23:00",
        });
      }

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

        const { data: mods } = await supabase
          .from("exo_tenant_mods")
          .select("id, mod_slug, mod_name, active, installed_at")
          .eq("tenant_id", user.id);
        setActiveMods(mods || []);

        const { data: skills } = await supabase
          .from("exo_generated_skills")
          .select("id, name, status, created_at")
          .eq("tenant_id", user.id)
          .eq("status", "active");
        setActiveSkills(skills || []);
      }

      try {
        const autoRes = await fetch("/api/settings/autonomy");
        if (autoRes.ok) {
          const autoJson = await autoRes.json();
          setAutonomyPermissions(autoJson.permissions || []);
        }
      } catch {
        // Non-blocking
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

  async function savePersonality() {
    try {
      setSavingPersonality(true);
      setPersonalitySaved(false);
      const response = await fetch("/api/settings/personality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalityForm),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Nie udalo sie zapisac osobowosci");
      }
      setPersonalitySaved(true);
      setTimeout(() => setPersonalitySaved(false), 2000);
    } catch (err) {
      console.error("[SettingsPage] Save personality error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSavingPersonality(false);
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

  async function toggleAutonomy(
    actionType: string,
    granted: boolean,
    requiresConfirmation: boolean = false,
  ) {
    setAutonomyLoading(true);
    try {
      const res = await fetch("/api/settings/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: actionType,
          domain: "*",
          granted,
          requires_confirmation: requiresConfirmation,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutonomyPermissions(data.permissions || []);
      }
    } catch (err) {
      console.error("[Settings] Autonomy toggle error:", err);
    } finally {
      setAutonomyLoading(false);
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

      <ProfileSection
        form={profileForm}
        setForm={setProfileForm}
        onSave={saveProfile}
        saving={savingProfile}
        saved={profileSaved}
      />

      <PersonalitySection
        form={personalityForm}
        setForm={setPersonalityForm}
        onSave={savePersonality}
        saving={savingPersonality}
        saved={personalitySaved}
      />

      <NotificationsSection
        form={notificationForm}
        setForm={setNotificationForm}
        onSave={saveNotifications}
        saving={savingNotifications}
        saved={notificationsSaved}
      />

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

      {/* Active Extensions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Aktywne rozszerzenia
          </CardTitle>
          <CardDescription>
            Mody i skille aktywowane automatycznie przez system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeMods.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Mody
              </p>
              {activeMods.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Puzzle className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">
                      {mod.mod_name || mod.mod_slug}
                    </span>
                  </div>
                  <Badge variant={mod.enabled ? "default" : "secondary"}>
                    {mod.enabled ? "Aktywny" : "Wylaczony"}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {activeSkills.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Skille
              </p>
              {activeSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium">{skill.name}</span>
                  </div>
                  <Badge variant="default">Aktywny</Badge>
                </div>
              ))}
            </div>
          )}

          {activeMods.length === 0 && activeSkills.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak aktywnych rozszerzen. System automatycznie zainstaluje mody i
              skille na podstawie Twoich potrzeb.
            </p>
          )}
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

      {/* Email Inbox */}
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
