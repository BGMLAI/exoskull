import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2 } from "lucide-react";

interface RecallSettingsData {
  enabled: boolean;
  interval_secs: number;
  storage_mode: string;
  exclusions: { id: number; pattern: string; exclusion_type: string }[];
}

interface Props {
  settings: RecallSettingsData | null;
  onUpdate: () => void;
}

export default function RecallSettings({ settings, onUpdate }: Props) {
  const [newExclusion, setNewExclusion] = useState("");

  if (!settings) return null;

  const updateSettings = async (key: string, value: string | number) => {
    try {
      await invoke("update_recall_settings", { [key]: value });
      onUpdate();
    } catch (err) {
      console.error("Failed to update recall settings:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Capture Interval */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-medium">Capture Interval</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          How often to take screenshots
        </p>
        <select
          value={settings.interval_secs}
          onChange={(e) => updateSettings("intervalSecs", Number(e.target.value))}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="10">Every 10 seconds</option>
          <option value="30">Every 30 seconds (Default)</option>
          <option value="60">Every 1 minute</option>
          <option value="120">Every 2 minutes</option>
          <option value="300">Every 5 minutes</option>
        </select>
      </div>

      {/* Storage Mode */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-medium">Storage Mode</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Where to store captured screenshots
        </p>
        <div className="space-y-2">
          {[
            { value: "local", label: "Local Only", desc: "Screenshots stay on your device" },
            { value: "cloud", label: "Cloud Only", desc: "Upload to ExoSkull cloud, delete local" },
            { value: "local+cloud", label: "Local + Cloud", desc: "Keep locally and sync to cloud" },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                settings.storage_mode === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="storage_mode"
                value={option.value}
                checked={settings.storage_mode === option.value}
                onChange={(e) => updateSettings("storageMode", e.target.value)}
                className="accent-primary"
              />
              <div>
                <span className="text-sm font-medium">{option.label}</span>
                <p className="text-xs text-muted-foreground">{option.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Exclusions */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-medium">App Exclusions</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Skip capture when these apps/windows are active
        </p>

        {settings.exclusions.length > 0 && (
          <div className="mb-3 space-y-2">
            {settings.exclusions.map((exc) => (
              <div
                key={exc.id}
                className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm"
              >
                <span>{exc.pattern}</span>
                <button className="text-destructive hover:text-destructive/80">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            placeholder="e.g., banking, private, incognito"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (newExclusion.trim()) {
                setNewExclusion("");
              }
            }}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
