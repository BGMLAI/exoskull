import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Loader2 } from "lucide-react";
import MouseConfig from "../components/assistant/MouseConfig";

interface AppSettings {
  auto_start: boolean;
  theme: string;
  tts_provider: string;
  recall: {
    enabled: boolean;
    interval_secs: number;
    storage_mode: string;
  };
  mouse: {
    button_dictation: number;
    button_tts: number;
    button_chat: number;
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then(setSettings)
      .catch((err) => console.error("Failed to load settings:", err));
  }, []);

  const updateSetting = async (
    key: string,
    value: boolean | string | number
  ) => {
    setSaving(true);
    try {
      await invoke("update_settings", { [key]: value });
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    } catch (err) {
      console.error("Failed to update setting:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure ExoSkull Desktop
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 p-6">
        {/* General */}
        <section>
          <h2 className="mb-4 text-base font-semibold">General</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-medium">Auto-start</h3>
                <p className="text-xs text-muted-foreground">
                  Launch ExoSkull when you log in
                </p>
              </div>
              <button
                onClick={() =>
                  updateSetting("auto_start", !settings.auto_start)
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${settings.auto_start ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${settings.auto_start ? "translate-x-5" : ""}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-medium">Theme</h3>
                <p className="text-xs text-muted-foreground">
                  Appearance mode
                </p>
              </div>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting("theme", e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </section>

        {/* TTS */}
        <section>
          <h2 className="mb-4 text-base font-semibold">Text-to-Speech</h2>
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">TTS Provider</h3>
                <p className="text-xs text-muted-foreground">
                  Voice engine for read-aloud
                </p>
              </div>
              <select
                value={settings.tts_provider}
                onChange={(e) =>
                  updateSetting("tts_provider", e.target.value)
                }
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="system">System Voice</option>
                <option value="elevenlabs">ElevenLabs (Premium)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Mouse */}
        <section>
          <h2 className="mb-4 text-base font-semibold">Mouse Assistant</h2>
          <MouseConfig config={settings.mouse} />
        </section>

        {/* Recall Quick Settings */}
        <section>
          <h2 className="mb-4 text-base font-semibold">Recall</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-medium">Capture Interval</h3>
                <p className="text-xs text-muted-foreground">
                  Seconds between screenshots
                </p>
              </div>
              <select
                value={settings.recall.interval_secs}
                onChange={(e) =>
                  invoke("update_recall_settings", {
                    intervalSecs: Number(e.target.value),
                  })
                }
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="10">10s</option>
                <option value="30">30s (Default)</option>
                <option value="60">1 min</option>
                <option value="120">2 min</option>
                <option value="300">5 min</option>
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <h3 className="text-sm font-medium">Storage Mode</h3>
                <p className="text-xs text-muted-foreground">
                  Where screenshots are stored
                </p>
              </div>
              <select
                value={settings.recall.storage_mode}
                onChange={(e) =>
                  invoke("update_recall_settings", {
                    storageMode: e.target.value,
                  })
                }
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="local">Local Only</option>
                <option value="cloud">Cloud Only</option>
                <option value="local+cloud">Local + Cloud</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
