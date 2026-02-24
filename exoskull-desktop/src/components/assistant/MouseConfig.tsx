import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mouse, Loader2 } from "lucide-react";

interface MouseConfigData {
  button_dictation: number;
  button_tts: number;
  button_chat: number;
}

interface Props {
  config: MouseConfigData;
}

export default function MouseConfig({ config }: Props) {
  const [saving, setSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("update_mouse_config", { config: localConfig });
    } catch (err) {
      console.error("Failed to update mouse config:", err);
    } finally {
      setSaving(false);
    }
  };

  const buttonOptions = [
    { value: 3, label: "Middle Click" },
    { value: 4, label: "Mouse Button 4 (Side)" },
    { value: 5, label: "Mouse Button 5 (Side)" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center gap-2">
          <Mouse className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Button Assignments</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm">Dictation (push-to-talk)</label>
            <select
              value={localConfig.button_dictation}
              onChange={(e) =>
                setLocalConfig((c) => ({
                  ...c,
                  button_dictation: Number(e.target.value),
                }))
              }
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              {buttonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Read Aloud (TTS)</label>
            <select
              value={localConfig.button_tts}
              onChange={(e) =>
                setLocalConfig((c) => ({
                  ...c,
                  button_tts: Number(e.target.value),
                }))
              }
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              {buttonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Quick Chat</label>
            <select
              value={localConfig.button_chat}
              onChange={(e) =>
                setLocalConfig((c) => ({
                  ...c,
                  button_chat: Number(e.target.value),
                }))
              }
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              {buttonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save Configuration"
          )}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: Side buttons on your mouse are detected as Mouse Button 4/5.
        If your buttons don't match, use the calibration flow in Settings.
      </p>
    </div>
  );
}
