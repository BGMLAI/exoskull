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
} from "lucide-react";

type ProviderName = "anthropic" | "openai" | "gemini";

interface ProviderState {
  enabled: boolean;
  has_key: boolean;
  key_masked: string | null;
  model?: string;
  status: "ok" | "no_credits" | "invalid_key" | "no_key" | "error";
  status_message?: string;
}

interface ProvidersConfig {
  default_provider: ProviderName;
  providers: Record<ProviderName, ProviderState>;
}

const PROVIDER_INFO: Record<
  ProviderName,
  {
    label: string;
    description: string;
    models?: { label: string; value: string }[];
  }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    description: "Claude Sonnet 4 / Haiku / Opus — glowny dostawca",
  },
  openai: {
    label: "OpenAI (GPT)",
    description: "GPT-4o / GPT-4o-mini — fallback",
    models: [
      { label: "GPT-4o", value: "gpt-4o" },
      { label: "GPT-4o Mini", value: "gpt-4o-mini" },
    ],
  },
  gemini: {
    label: "Google Gemini",
    description: "Gemini 1.5 Flash — szybki i tani",
  },
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

  // Per-provider key edit state
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
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error("[AIProviders] Load error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(updates: Partial<ProvidersConfig>) {
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
      const data = await res.json();
      setConfig(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[AIProviders] Save error:", err);
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  async function saveProviderKey(provider: ProviderName, apiKey: string) {
    await saveConfig({
      providers: {
        ...Object.fromEntries(
          (Object.keys(PROVIDER_INFO) as ProviderName[]).map((p) => [
            p,
            p === provider ? { api_key: apiKey } : {},
          ]),
        ),
      } as Record<ProviderName, ProviderState>,
    });
    setEditingKey(null);
    setKeyInput("");
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
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

  const providerOrder: ProviderName[] = ["anthropic", "openai", "gemini"];
  const fallbackChain = providerOrder.filter(
    (p) => config.providers[p]?.enabled && config.providers[p]?.has_key,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Dostawcy AI
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
          Wybierz dostawcow AI i wpisz wlasne klucze API. System automatycznie
          przelacza na zapasowego dostawce gdy glowny jest niedostepny.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Default provider selector */}
        <div className="flex items-center gap-4">
          <Label className="min-w-[140px]">Domyslny dostawca</Label>
          <Select
            value={config.default_provider}
            onValueChange={(val) =>
              saveConfig({ default_provider: val as ProviderName })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOrder.map((p) => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_INFO[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Provider cards */}
        {providerOrder.map((providerName) => {
          const provider = config.providers[providerName];
          const info = PROVIDER_INFO[providerName];
          const statusCfg = STATUS_CONFIG[provider?.status || "no_key"];
          const StatusIcon = statusCfg.icon;
          const isEditing = editingKey === providerName;
          const isDefault = config.default_provider === providerName;

          return (
            <div
              key={providerName}
              className={`rounded-lg border p-4 space-y-3 ${
                isDefault ? "border-primary/50 bg-primary/5" : ""
              }`}
            >
              {/* Header */}
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
                  variant={provider?.enabled !== false ? "default" : "outline"}
                  onClick={() =>
                    saveConfig({
                      providers: {
                        ...Object.fromEntries(
                          providerOrder.map((p) => [
                            p,
                            p === providerName
                              ? { enabled: provider?.enabled === false }
                              : {},
                          ]),
                        ),
                      } as Record<ProviderName, ProviderState>,
                    })
                  }
                >
                  {provider?.enabled !== false ? "Wlaczony" : "Wylaczony"}
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                {info.description}
              </p>

              {/* API Key */}
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

              {/* Model selector (OpenAI only) */}
              {info.models && provider?.enabled && (
                <div className="flex items-center gap-2">
                  <Label className="min-w-[80px] text-sm">Model</Label>
                  <Select
                    value={provider?.model || info.models[0].value}
                    onValueChange={(val) =>
                      saveConfig({
                        providers: {
                          ...Object.fromEntries(
                            providerOrder.map((p) => [
                              p,
                              p === providerName ? { model: val } : {},
                            ]),
                          ),
                        } as Record<ProviderName, ProviderState>,
                      })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {info.models.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status message */}
              {provider?.status_message && (
                <p className="text-xs text-muted-foreground">
                  {provider.status_message}
                </p>
              )}
            </div>
          );
        })}

        {/* Fallback chain visualization */}
        {fallbackChain.length > 0 && (
          <div className="pt-2 border-t">
            <Label className="text-sm text-muted-foreground">
              Kolejnosc fallback
            </Label>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {fallbackChain.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">
                    {PROVIDER_INFO[p].label.split(" ")[0]}
                  </Badge>
                  {i < fallbackChain.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
