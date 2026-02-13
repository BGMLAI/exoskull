/**
 * VoiceIDPanel — Settings panel for changing AI voice
 *
 * Allows user to:
 * - Paste 11labs voice ID
 * - Preview the voice
 * - Save to tenant config
 */
"use client";

import React, { useState, useEffect } from "react";
import { Volume2, Save, RefreshCw, Check, AlertCircle } from "lucide-react";

interface VoiceIDPanelProps {
  tenantId?: string;
}

export default function VoiceIDPanel({ tenantId }: VoiceIDPanelProps) {
  const [voiceId, setVoiceId] = useState("");
  const [currentVoiceId, setCurrentVoiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCurrentVoice();
  }, []);

  async function loadCurrentVoice() {
    try {
      const res = await fetch("/api/settings/voice");
      if (res.ok) {
        const data = await res.json();
        const id = data.voiceId || "";
        setVoiceId(id);
        setCurrentVoiceId(id);
      }
    } catch {
      // Ignore
    }
  }

  async function handleSave() {
    if (!voiceId.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/settings/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voiceId.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udało się zapisać");
      }

      setCurrentVoiceId(voiceId.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (!voiceId.trim()) return;
    setPreviewing(true);
    setError("");

    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Cześć! To jest podgląd mojego głosu. Jak Ci się podoba?",
          voiceId: voiceId.trim(),
        }),
      });

      if (!res.ok) throw new Error("Preview failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreviewing(false);
      };
      audio.play();
    } catch (err) {
      setError("Nie udało się odtworzyć podglądu. Sprawdź Voice ID.");
      setPreviewing(false);
    }
  }

  const hasChanged = voiceId.trim() !== currentVoiceId;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Volume2 className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-semibold">Głos AI</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Wklej Voice ID z{" "}
        <a
          href="https://elevenlabs.io/voice-library"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          ElevenLabs
        </a>{" "}
        żeby zmienić głos asystenta.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          placeholder="np. pNInz6obpgDQGcFmaJgB"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
        />

        <button
          onClick={handlePreview}
          disabled={!voiceId.trim() || previewing}
          className="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {previewing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
          Test
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanged || saving}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {saved ? (
            <Check className="w-4 h-4" />
          ) : saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? "Zapisano!" : "Zapisz"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {currentVoiceId && (
        <div className="text-[10px] text-muted-foreground">
          Aktualny ID:{" "}
          <code className="bg-muted px-1 rounded">{currentVoiceId}</code>
        </div>
      )}
    </div>
  );
}
