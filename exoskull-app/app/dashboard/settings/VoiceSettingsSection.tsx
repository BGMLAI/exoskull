"use client";

/**
 * VoiceSettingsSection — Voice configuration panel in Settings
 *
 * Controls:
 * - TTS voice selection (Cartesia voice ID + preview)
 * - TTS speed slider
 * - Silence auto-stop timeout
 * - Bot identity (name, email, phone, introduction style)
 * - Outbound call permissions
 */

import { useState, useEffect, useCallback, useRef } from "react";
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
import {
  Mic,
  Volume2,
  Phone,
  Shield,
  Play,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";

// ============================================================================
// Simple Slider component (native range input styled with Tailwind)
// ============================================================================

function Slider({
  min,
  max,
  step,
  value,
  onValueChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number[];
  onValueChange: (value: number[]) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0]}
      onChange={(e) => onValueChange([Number(e.target.value)])}
      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
    />
  );
}

// ============================================================================
// Voice presets (Cartesia voices with Polish support)
// ============================================================================

interface VoicePreset {
  id: string;
  name: string;
  description: string;
  gender: "male" | "female";
  style: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "82a7fc13-2927-4e42-9b8a-bb1f9e506521",
    name: "Tomek",
    description: "Casual Companion",
    gender: "male",
    style: "Energetic, casual conversations",
  },
  {
    id: "a0e99841-438c-4a64-b679-ae501e7d6091",
    name: "British Lady",
    description: "Professional female",
    gender: "female",
    style: "Clear, professional tone",
  },
  {
    id: "79a125e8-cd45-4c13-8a67-188112f4dd22",
    name: "Commercial Guy",
    description: "Confident male",
    gender: "male",
    style: "Confident, broadcast quality",
  },
  {
    id: "b7d50908-b17c-442d-ad8d-810c63997ed9",
    name: "California Girl",
    description: "Friendly female",
    gender: "female",
    style: "Warm, approachable",
  },
  {
    id: "694f9389-aac1-45b6-b726-9d9369183238",
    name: "Friendly Sidekick",
    description: "Casual helper",
    gender: "male",
    style: "Relaxed, supportive",
  },
];

// ============================================================================
// Types
// ============================================================================

interface VoiceConfig {
  tts_voice_id: string;
  tts_speed: number;
  tts_provider: string;
  stt_provider: string;
  silence_timeout_s: number;
  bot_identity: {
    display_name: string;
    outbound_phone: string | null;
    outbound_email: string;
    introduction_style: "behalf" | "assistant" | "custom";
    custom_introduction: string | null;
  };
  outbound_calls: {
    enabled: boolean;
    max_per_day: number;
    allow_third_party: boolean;
    allow_checkin_calls: boolean;
    allow_alert_calls: boolean;
  };
}

// ============================================================================
// Component
// ============================================================================

export function VoiceSettingsSection() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voice settings
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/settings/voice");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setConfig(data.voiceConfig);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save voice settings
  const handleSave = useCallback(async () => {
    if (!config) return;
    try {
      setSaving(true);
      setSaved(false);
      setError(null);

      const res = await fetch("/api/settings/voice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setConfig(data.voiceConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Preview voice via TTS API
  const handlePreview = useCallback(async () => {
    if (!config) return;
    try {
      setPreviewing(true);
      setError(null);

      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Cześć! Tu twój asystent. Tak będę brzmiał podczas rozmów.",
          voiceId: config.tts_voice_id,
          speed: config.tts_speed,
        }),
      });

      if (!res.ok) {
        // Fallback: use browser TTS
        const utterance = new SpeechSynthesisUtterance(
          "Cześć! Tu twój asystent. Tak będę brzmiał podczas rozmów.",
        );
        utterance.lang = "pl-PL";
        utterance.rate = config.tts_speed;
        utterance.onend = () => setPreviewing(false);
        utterance.onerror = () => setPreviewing(false);
        window.speechSynthesis.speak(utterance);
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewing(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setPreviewing(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch {
      // Final fallback: browser TTS
      const utterance = new SpeechSynthesisUtterance(
        "Cześć! Tu twój asystent.",
      );
      utterance.lang = "pl-PL";
      utterance.rate = config?.tts_speed || 1.0;
      utterance.onend = () => setPreviewing(false);
      utterance.onerror = () => setPreviewing(false);
      window.speechSynthesis.speak(utterance);
    }
  }, [config]);

  // Update helper
  const update = useCallback(
    (patch: Partial<VoiceConfig>) => {
      if (!config) return;
      setConfig({ ...config, ...patch });
    },
    [config],
  );

  const updateBotIdentity = useCallback(
    (patch: Partial<VoiceConfig["bot_identity"]>) => {
      if (!config) return;
      setConfig({
        ...config,
        bot_identity: { ...config.bot_identity, ...patch },
      });
    },
    [config],
  );

  const updateOutbound = useCallback(
    (patch: Partial<VoiceConfig["outbound_calls"]>) => {
      if (!config) return;
      setConfig({
        ...config,
        outbound_calls: { ...config.outbound_calls, ...patch },
      });
    },
    [config],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Ladowanie ustawien glosu...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Nie udalo sie zaladowac ustawien glosu.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedVoice = VOICE_PRESETS.find((v) => v.id === config.tts_voice_id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Glos i komunikacja
        </CardTitle>
        <CardDescription>
          Konfiguracja glosu TTS, auto-stop, tozsamosc bota i polaczenia
          wychodzace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ============================================================== */}
        {/* Voice Selection */}
        {/* ============================================================== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            Glos TTS
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Voice preset dropdown */}
            <div className="space-y-2">
              <Label>Glos</Label>
              <Select
                value={config.tts_voice_id}
                onValueChange={(value) => update({ tts_voice_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz glos" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_PRESETS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{voice.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({voice.description})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVoice && (
                <p className="text-xs text-muted-foreground">
                  {selectedVoice.style}
                </p>
              )}
            </div>

            {/* Custom voice ID input */}
            <div className="space-y-2">
              <Label htmlFor="custom_voice_id">
                Lub wklej ID glosu (Cartesia)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="custom_voice_id"
                  value={config.tts_voice_id}
                  onChange={(e) => update({ tts_voice_id: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="shrink-0"
                >
                  {previewing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Speed slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Predkosc mowy</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {config.tts_speed.toFixed(1)}x
              </span>
            </div>
            <Slider
              min={0.5}
              max={2.0}
              step={0.1}
              value={[config.tts_speed]}
              onValueChange={([v]: number[]) => update({ tts_speed: v })}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Wolno (0.5x)</span>
              <span>Normalna (1.0x)</span>
              <span>Szybko (2.0x)</span>
            </div>
          </div>

          {/* Silence timeout */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Auto-stop po ciszy</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {config.silence_timeout_s}s
              </span>
            </div>
            <Slider
              min={2}
              max={15}
              step={1}
              value={[config.silence_timeout_s]}
              onValueChange={([v]: number[]) =>
                update({ silence_timeout_s: v })
              }
            />
            <p className="text-xs text-muted-foreground">
              Dyktowanie zatrzyma sie automatycznie po tylu sekundach ciszy
            </p>
          </div>

          {/* Provider selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dostawca TTS</Label>
              <Select
                value={config.tts_provider}
                onValueChange={(value) => update({ tts_provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartesia">
                    Cartesia Sonic 3 (zalecany)
                  </SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="browser">
                    Przegladarka (darmowy)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dostawca STT</Label>
              <Select
                value={config.stt_provider}
                onValueChange={(value) => update({ stt_provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="groq">Groq Whisper (zalecany)</SelectItem>
                  <SelectItem value="deepgram">Deepgram Nova</SelectItem>
                  <SelectItem value="openai">OpenAI Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <hr className="border-border" />

        {/* ============================================================== */}
        {/* Bot Identity */}
        {/* ============================================================== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Tozsamosc bota
          </h3>
          <p className="text-xs text-muted-foreground">
            Jak bot sie przedstawia dzwoniac lub pisac w Twoim imieniu
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bot_name">Nazwa bota</Label>
              <Input
                id="bot_name"
                value={config.bot_identity.display_name}
                onChange={(e) =>
                  updateBotIdentity({ display_name: e.target.value })
                }
                placeholder="IORS"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>Styl przedstawiania</Label>
              <Select
                value={config.bot_identity.introduction_style}
                onValueChange={(value) =>
                  updateBotIdentity({
                    introduction_style: value as
                      | "behalf"
                      | "assistant"
                      | "custom",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="behalf">
                    W imieniu (&quot;Dzwonie w imieniu...&quot;)
                  </SelectItem>
                  <SelectItem value="assistant">
                    Asystent (&quot;Jestem asystentem...&quot;)
                  </SelectItem>
                  <SelectItem value="custom">Wlasny tekst</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.bot_identity.introduction_style === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom_intro">Wlasny tekst wprowadzenia</Label>
              <Input
                id="custom_intro"
                value={config.bot_identity.custom_introduction || ""}
                onChange={(e) =>
                  updateBotIdentity({
                    custom_introduction: e.target.value || null,
                  })
                }
                placeholder="Dzien dobry, tu {bot_name} od {user_name}. {purpose}"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Dostepne zmienne: {"{bot_name}"}, {"{user_name}"}, {"{purpose}"}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outbound_email">Email wychodzacy</Label>
              <Input
                id="outbound_email"
                value={config.bot_identity.outbound_email}
                onChange={(e) =>
                  updateBotIdentity({ outbound_email: e.target.value })
                }
                placeholder="iors@exoskull.xyz"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outbound_phone">Telefon wychodzacy</Label>
              <Input
                id="outbound_phone"
                value={config.bot_identity.outbound_phone || ""}
                onChange={(e) =>
                  updateBotIdentity({
                    outbound_phone: e.target.value || null,
                  })
                }
                placeholder="+48... (domyslnie systemowy Twilio)"
              />
            </div>
          </div>
        </div>

        <hr className="border-border" />

        {/* ============================================================== */}
        {/* Outbound Calls */}
        {/* ============================================================== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Polaczenia wychodzace
          </h3>
          <p className="text-xs text-muted-foreground">
            Kontrola automatycznych polaczen od bota
          </p>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={config.outbound_calls.enabled}
                onChange={(e) => updateOutbound({ enabled: e.target.checked })}
              />
              <div>
                <p className="text-sm font-medium">
                  Wlacz polaczenia wychodzace
                </p>
                <p className="text-xs text-muted-foreground">
                  Bot moze dzwonic do Ciebie i w Twoim imieniu
                </p>
              </div>
            </label>

            {config.outbound_calls.enabled && (
              <>
                <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={config.outbound_calls.allow_checkin_calls}
                    onChange={(e) =>
                      updateOutbound({
                        allow_checkin_calls: e.target.checked,
                      })
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Check-iny (poranne/wieczorne)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Zaplanowane rozmowy sprawdzajace samopoczucie
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={config.outbound_calls.allow_alert_calls}
                    onChange={(e) =>
                      updateOutbound({
                        allow_alert_calls: e.target.checked,
                      })
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Alerty i przypomnienia
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pilne powiadomienia glosowe (np. zaleglosci, zdrowie)
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={config.outbound_calls.allow_third_party}
                    onChange={(e) =>
                      updateOutbound({
                        allow_third_party: e.target.checked,
                      })
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Dzwonienie do osob trzecich
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Zamawianie pizzy, umawianie wizyt, rezerwacje
                    </p>
                  </div>
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Max polaczen dziennie</Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {config.outbound_calls.max_per_day}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[config.outbound_calls.max_per_day]}
                    onValueChange={([v]: number[]) =>
                      updateOutbound({ max_per_day: v })
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* Save Button */}
        {/* ============================================================== */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              "Zapisz ustawienia glosu"
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check className="w-4 h-4" />
              Zapisano
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
