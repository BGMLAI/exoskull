"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Check,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Layers,
} from "lucide-react";

type ProviderName = "deepseek" | "gemini" | "groq" | "anthropic" | "openai";

interface ProviderState {
  enabled: boolean;
  has_key: boolean;
  key_masked: string | null;
  model?: string;
  status: "ok" | "no_credits" | "invalid_key" | "no_key" | "error";
  status_message?: string;
}

interface AvailableModel {
  id: string;
  displayName: string;
  tier: number;
  provider: string;
  costInfo: string;
}

interface ProvidersConfig {
  default_provider: ProviderName;
  providers: Record<string, ProviderState>;
  tier_overrides: Record<string, { modelId?: string }>;
  available_models: AvailableModel[];
  tier_defaults: Record<string, string[]>;
}

const PROVIDER_ORDER: ProviderName[] = [
  "deepseek",
  "gemini",
  "groq",
  "anthropic",
  "openai",
];

const PROVIDER_INFO: Record<
  ProviderName,
  { label: string; description: string }
> = {
  deepseek: {
    label: "DeepSeek",
    description: "V3 (tani, szybki) + R1 (deep reasoning) — domyslny Tier 1-4",
  },
  gemini: {
    label: "Google Gemini",
    description: "Flash (Tier 1) + Pro (Tier 2-3) — duzy context window",
  },
  groq: {
    label: "Groq",
    description: "Llama 3.3 70B — darmowy, szybki, limit 30 RPM",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    description: "Haiku / Sonnet / Opus — premium (wymaga klucza BYOK)",
  },
  openai: {
    label: "OpenAI",
    description: "Codex 5.2 (code gen) + GPT-4o — fallback",
  },
};

const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 — Proste (klasyfikacja, routing)",
  2: "Tier 2 — Analiza (summarization, patterns)",
  3: "Tier 3 — Zlozzone (code gen, reasoning)",
  4: "Tier 4 — Strategiczne (kryzys, coaching)",
};

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Check; color: string; badgeVariant: string; label: string }
> = {
  ok: {
    icon: Check,
    color: "text-green-500",
    badgeVariant:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    label: "Aktywny",
  },
  no_credits: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    badgeVariant:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    label: "Brak kredytow",
  },
  invalid_key: {
    icon: XCircle,
    color: "text-red-500",
    badgeVariant:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    label: "Nieprawidlowy klucz",
  },
  no_key: {
    icon: XCircle,
    color: "text-muted-foreground",
    badgeVariant: "bg-muted text-muted-foreground",
    label: "Brak klucza",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    badgeVariant:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    label: "Blad",
  },
};

export function AIProvidersSection() {
  const [config, setConfig] = useState<ProvidersConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<ProviderName | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const res = await fetch("/api/settings/ai-providers");
      if (!res.ok) throw new Error("Nie udalo sie pobrac konfiguracji");
      setConfig(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(updates: Record<string, unknown>) {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const res = await fetch("/api/settings/ai-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      // Merge response with existing config to keep available_models etc.
      const data = await res.json();
      setConfig((prev) => (prev ? { ...prev, ...data } : data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  async function saveProviderKey(provider: ProviderName, apiKey: string) {
    await saveConfig({
      providers: { [provider]: { api_key: apiKey } },
    });
    setEditingKey(null);
    setKeyInput("");
  }

  async function saveTierOverride(tier: number, modelId: string) {
    const current = config?.tier_overrides ?? {};
    const updated = { ...current };
    if (modelId === "default") {
      delete updated[tier];
    } else {
      updated[tier] = { modelId };
    }
    await saveConfig({ tier_overrides: updated });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Dostawcy AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || "Nie udalo sie zaladowac konfiguracji dostawcow."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeProviders = PROVIDER_ORDER.filter(
    (p) => config.providers[p]?.enabled && config.providers[p]?.status === "ok",
  );

  return (
    <div className="space-y-6">
      {/* Provider Keys Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Dostawcy AI (BYOK)
            {saving && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Zapisywanie...
              </Badge>
            )}
            {saved && (
              <Badge className="ml-2 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Zapisano
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            System ma domyslne modele (tanie). Dodaj wlasne klucze API aby
            odblokowac premium modele (Claude, GPT-4o). Klucze sa szyfrowane.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {PROVIDER_ORDER.map((providerName) => {
            const provider = config.providers[providerName];
            const info = PROVIDER_INFO[providerName];
            const statusCfg =
              STATUS_CONFIG[provider?.status || "no_key"] ||
              STATUS_CONFIG.no_key;
            const StatusIcon = statusCfg.icon;
            const isEditing = editingKey === providerName;
            const isDefault = config.default_provider === providerName;

            return (
              <div
                key={providerName}
                className={`rounded-lg border p-4 space-y-2 ${
                  isDefault ? "border-primary/50 bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
                    <span className="font-medium">{info.label}</span>
                    {isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Domyslny
                      </Badge>
                    )}
                    <Badge className={statusCfg.badgeVariant + " text-xs"}>
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant={
                      provider?.enabled !== false ? "default" : "outline"
                    }
                    onClick={() =>
                      saveConfig({
                        providers: {
                          [providerName]: {
                            enabled: provider?.enabled === false,
                          },
                        },
                      })
                    }
                  >
                    {provider?.enabled !== false ? "Wlaczony" : "Wylaczony"}
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground">
                  {info.description}
                </p>

                <div className="flex items-center gap-2">
                  <Label className="min-w-[80px] text-sm">Klucz API</Label>
                  {isEditing ? (
                    <>
                      <div className="relative flex-1">
                        <Input
                          type={showKey ? "text" : "password"}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="Wklej klucz API..."
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveProviderKey(providerName, keyInput)}
                        disabled={!keyInput.trim()}
                      >
                        Zapisz
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingKey(null);
                          setKeyInput("");
                        }}
                      >
                        Anuluj
                      </Button>
                    </>
                  ) : (
                    <>
                      <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded flex-1">
                        {provider?.key_masked || "Nie ustawiony"}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingKey(providerName);
                          setKeyInput("");
                          setShowKey(false);
                        }}
                      >
                        {provider?.has_key ? "Zmien" : "Ustaw"}
                      </Button>
                      {provider?.has_key && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => saveProviderKey(providerName, "")}
                        >
                          Usun
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Fallback chain */}
          {activeProviders.length > 0 && (
            <div className="pt-2 border-t">
              <Label className="text-sm text-muted-foreground">
                Aktywni dostawcy (fallback chain)
              </Label>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {activeProviders.map((p, i) => (
                  <span key={p} className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {PROVIDER_INFO[p].label}
                    </Badge>
                    {i < activeProviders.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier Model Overrides Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Wybor modeli per Tier
          </CardTitle>
          <CardDescription>
            Domyslnie system automatycznie wybiera najtanszy model dla kazdego
            poziomu zlozonosci. Tutaj mozesz nadpisac wybor dla kazdego tieru.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([1, 2, 3, 4] as number[]).map((tier) => {
            const defaults = config.tier_defaults?.[tier] || [];
            const override = config.tier_overrides?.[tier]?.modelId;
            const models = config.available_models || [];
            const tierModels = models.filter((m) => {
              // Show models from this tier and adjacent tiers
              return Math.abs(m.tier - tier) <= 1;
            });

            return (
              <div key={tier} className="flex items-center gap-4">
                <Label className="min-w-[280px] text-sm">
                  {TIER_LABELS[tier] || `Tier ${tier}`}
                </Label>
                <Select
                  value={override || "default"}
                  onValueChange={(val) => saveTierOverride(tier, val)}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      Auto ({defaults.join(", ")})
                    </SelectItem>
                    {tierModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName} — {m.costInfo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {override && (
                  <Badge variant="outline" className="text-xs">
                    Override
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
