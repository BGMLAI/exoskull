"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ModConfig {
  fields: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
    min?: number;
    max?: number;
    default?: number;
  }>;
  widget: string;
  chart_type?: string;
  daily_goal?: number;
}

interface ModRegistry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  config: ModConfig;
}

interface ModDataEntry {
  id: string;
  tenant_id: string;
  mod_slug: string;
  data: Record<string, unknown>;
  created_at: string;
}

interface InstalledMod {
  id: string;
  active: boolean;
  installed_at: string;
  config_overrides: Record<string, unknown>;
  mod: ModRegistry;
}

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-blue-500" />,
  warning: <AlertCircle className="w-4 h-4 text-yellow-500" />,
  success: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  alert: <AlertCircle className="w-4 h-4 text-red-500" />,
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ModDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [installation, setInstallation] = useState<InstalledMod | null>(null);
  const [entries, setEntries] = useState<ModDataEntry[]>([]);
  const [insights, setInsights] = useState<
    Array<{
      type: string;
      title: string;
      message: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [inputData, setInputData] = useState<Record<string, string | number>>(
    {},
  );
  const [saving, setSaving] = useState(false);

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch installation info: first get mod_id from registry by slug
      const { data: modReg } = await supabase
        .from("exo_mod_registry")
        .select("id")
        .eq("slug", slug)
        .single();

      if (modReg) {
        const { data: instData } = await supabase
          .from("exo_tenant_mods")
          .select(
            `
            id,
            active,
            installed_at,
            config_overrides,
            mod:exo_mod_registry (
              id, slug, name, description, icon, category, config
            )
          `,
          )
          .eq("tenant_id", user.id)
          .eq("mod_id", modReg.id)
          .single();

        if (instData) {
          setInstallation(instData as unknown as InstalledMod);
        }
      }

      // Fetch recent data entries
      const dataRes = await fetch(`/api/mods/${slug}/data?limit=20`);
      if (dataRes.ok) {
        const dataJson = await dataRes.json();
        setEntries(dataJson.data || []);
      }

      // Try fetching insights (may 501 if no executor)
      try {
        const insightRes = await fetch(`/api/mods/${slug}`);
        if (insightRes.ok) {
          const insightJson = await insightRes.json();
          setInsights(insightJson.insights || []);
        }
      } catch {
        // Insights not available — that's fine
      }
    } catch (error) {
      console.error("[ModDetail] Fetch error:", {
        slug,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleAddEntry = async () => {
    if (!installation) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mods/${slug}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputData),
      });

      if (res.ok) {
        setInputData({});
        setShowInput(false);
        await fetchData();
      } else {
        const err = await res.json();
        console.error("[ModDetail] Add entry error:", { slug, error: err });
      }
    } catch (error) {
      console.error("[ModDetail] Add entry error:", {
        slug,
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!installation) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("exo_tenant_mods")
        .update({ active: !installation.active })
        .eq("id", installation.id);

      if (error) {
        console.error("[ModDetail] Toggle error:", { slug, error });
        return;
      }

      setInstallation((prev) =>
        prev ? { ...prev, active: !prev.active } : prev,
      );
    } catch (error) {
      console.error("[ModDetail] Toggle error:", {
        slug,
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  const mod = installation?.mod;
  const config = mod?.config;

  const renderFieldInput = (
    field: ModConfig["fields"][0],
    value: string | number,
    onChange: (v: string | number) => void,
  ) => {
    if (field.type === "select" && field.options) {
      return (
        <Select value={String(value || "")} onValueChange={(v) => onChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Wybierz..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "textarea") {
      return (
        <Textarea
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.label}
        />
      );
    }

    if (field.type === "number") {
      return (
        <Input
          type="number"
          min={field.min}
          max={field.max}
          value={value ?? field.default ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={field.label}
        />
      );
    }

    return (
      <Input
        type="text"
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label}
      />
    );
  };

  const formatEntryValue = (data: Record<string, unknown>): string => {
    return Object.entries(data)
      .filter(([k]) => k !== "id")
      .map(([, v]) => String(v))
      .join(" · ");
  };

  // --------------------------------------------------------------------------
  // LOADING / NOT FOUND
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!installation || !mod) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/skills?tab=active")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Wrocdo modow
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Mod nie znaleziony</h3>
            <p className="text-muted-foreground">
              Mod &quot;{slug}&quot; nie jest zainstalowany lub nie istnieje.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/skills?tab=active")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Wrocdo modow
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{mod.icon || "📦"}</span>
            <div>
              <h1 className="text-2xl font-bold">{mod.name}</h1>
              <p className="text-muted-foreground">{mod.description}</p>
            </div>
          </div>
          <Button
            variant={installation.active ? "outline" : "default"}
            size="sm"
            onClick={handleToggleActive}
          >
            {installation.active ? (
              <>
                <Power className="w-4 h-4 mr-2" />
                Aktywny
              </>
            ) : (
              <>
                <PowerOff className="w-4 h-4 mr-2" />
                Wylaczony
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.info}
                    <div>
                      <p className="font-medium text-sm">{insight.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {insight.message}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick Input */}
      {config?.fields && config.fields.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Dodaj wpis</CardTitle>
              {!showInput && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowInput(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nowy wpis
                </Button>
              )}
            </div>
          </CardHeader>
          {showInput && (
            <CardContent className="space-y-4">
              {config.fields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <label className="text-sm font-medium">{field.label}</label>
                  {renderFieldInput(field, inputData[field.name] ?? "", (v) =>
                    setInputData((prev) => ({ ...prev, [field.name]: v })),
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleAddEntry}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Zapisz
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInput(false);
                    setInputData({});
                  }}
                >
                  Anuluj
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Data Entries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Ostatnie wpisy ({entries.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Brak danych. Dodaj pierwszy wpis lub powiedz IORSowi.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {formatEntryValue(entry.data)}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(entry.created_at).toLocaleString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
