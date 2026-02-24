import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, Search, Play, Pause, Loader2, Calendar } from "lucide-react";
import RecallTimeline from "../components/recall/RecallTimeline";
import RecallSearch from "../components/recall/RecallSearch";
import RecallSettings from "../components/recall/RecallSettings";

interface RecallSettingsData {
  enabled: boolean;
  interval_secs: number;
  storage_mode: string;
  exclusions: { id: number; pattern: string; exclusion_type: string }[];
}

export default function RecallPage() {
  const [tab, setTab] = useState<"timeline" | "search" | "settings">(
    "timeline"
  );
  const [settings, setSettings] = useState<RecallSettingsData | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await invoke<RecallSettingsData>("get_recall_settings");
      setSettings(data);
    } catch (err) {
      console.error("Failed to load recall settings:", err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleRecall = async () => {
    setToggling(true);
    try {
      if (settings?.enabled) {
        await invoke("stop_recall");
      } else {
        await invoke("start_recall");
      }
      await loadSettings();
    } catch (err) {
      console.error("Failed to toggle recall:", err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Recall</h1>
            <p className="text-sm text-muted-foreground">
              Screen capture with AI-powered search
            </p>
          </div>
          <button
            onClick={toggleRecall}
            disabled={toggling}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              settings?.enabled
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : settings?.enabled ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {settings?.enabled ? "Stop Capture" : "Start Capture"}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-4">
          {(["timeline", "search", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === "timeline" && <RecallTimeline />}
        {tab === "search" && <RecallSearch />}
        {tab === "settings" && (
          <RecallSettings settings={settings} onUpdate={loadSettings} />
        )}
      </div>
    </div>
  );
}
