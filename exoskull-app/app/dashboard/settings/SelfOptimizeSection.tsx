"use client";

import { useState, useEffect, Fragment } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2, Check, X, RotateCcw } from "lucide-react";

// -------------------------------------------------------------------
// Permission Types
// -------------------------------------------------------------------

interface PermissionEntry {
  with_approval: boolean;
  autonomous: boolean;
}

type Permissions = Record<string, PermissionEntry>;

interface OptimizationEntry {
  id: string;
  parameter: string;
  description: string;
  before_state: string;
  after_state: string;
  status: "proposed" | "applied" | "rolled_back" | "rejected";
  created_at: string;
}

// -------------------------------------------------------------------
// Permission Rows Config
// -------------------------------------------------------------------

interface PermRow {
  key: string;
  label: string;
}

interface PermGroup {
  label: string;
  rows: PermRow[];
}

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "STYL KOMUNIKACJI",
    rows: [
      { key: "style_formality", label: "Formalnosc (luzny / formalny)" },
      { key: "style_humor", label: "Humor (powazny / zabawny)" },
      {
        key: "style_directness",
        label: "Bezposredniosc (delikatny / bezposredni)",
      },
      { key: "style_empathy", label: "Empatia (rzeczowy / empatyczny)" },
      { key: "style_detail", label: "Szczegolowos (krotko / dokladnie)" },
    ],
  },
  {
    label: "PROAKTYWNOSC",
    rows: [
      { key: "proactivity", label: "Poziom proaktywnosci (0-100)" },
      { key: "loop_frequency", label: "Czestotliwosc petli" },
      { key: "ai_budget", label: "Budzet AI dzienny" },
    ],
  },
  {
    label: "PARAMETRY AI",
    rows: [
      { key: "temperature", label: "Temperatura (kreatywnos)" },
      { key: "tts_speed", label: "Predkosc mowy (TTS)" },
      { key: "model_chat", label: "Wybor modelu: Chat" },
      { key: "model_analysis", label: "Wybor modelu: Analiza" },
      { key: "model_coding", label: "Wybor modelu: Kodowanie" },
      { key: "model_creative", label: "Wybor modelu: Kreatywne" },
      { key: "model_crisis", label: "Wybor modelu: Kryzys" },
    ],
  },
  {
    label: "SYSTEM PROMPT",
    rows: [
      { key: "prompt_add", label: "Dodawanie instrukcji" },
      { key: "prompt_remove", label: "Usuwanie instrukcji" },
      { key: "preset_toggle", label: "Wlaczanie/wylaczanie presetow" },
      { key: "prompt_override", label: "Nadpisanie system prompt" },
    ],
  },
  {
    label: "BUDOWANIE",
    rows: [
      { key: "skill_propose", label: "Propozycja nowego skilla" },
      { key: "app_build", label: "Budowanie aplikacji" },
    ],
  },
];

const DEFAULT_PERMISSIONS: Permissions = {
  style_formality: { with_approval: true, autonomous: false },
  style_humor: { with_approval: true, autonomous: false },
  style_directness: { with_approval: true, autonomous: false },
  style_empathy: { with_approval: true, autonomous: false },
  style_detail: { with_approval: true, autonomous: false },
  proactivity: { with_approval: true, autonomous: false },
  loop_frequency: { with_approval: true, autonomous: false },
  ai_budget: { with_approval: false, autonomous: false },
  temperature: { with_approval: true, autonomous: false },
  tts_speed: { with_approval: true, autonomous: false },
  model_chat: { with_approval: true, autonomous: false },
  model_analysis: { with_approval: true, autonomous: false },
  model_coding: { with_approval: false, autonomous: false },
  model_creative: { with_approval: true, autonomous: false },
  model_crisis: { with_approval: false, autonomous: false },
  prompt_add: { with_approval: true, autonomous: false },
  prompt_remove: { with_approval: false, autonomous: false },
  preset_toggle: { with_approval: true, autonomous: false },
  prompt_override: { with_approval: false, autonomous: false },
  skill_propose: { with_approval: true, autonomous: false },
  app_build: { with_approval: true, autonomous: false },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  proposed: {
    label: "Oczekuje",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  applied: {
    label: "Zastosowane",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  rolled_back: {
    label: "Cofniete",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  rejected: {
    label: "Odrzucone",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

export function SelfOptimizeSection() {
  const [permissions, setPermissions] =
    useState<Permissions>(DEFAULT_PERMISSIONS);
  const [history, setHistory] = useState<OptimizationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/optimizations");
        if (!res.ok)
          throw new Error("Nie udalo sie pobrac danych optymalizacji");
        const data = await res.json();
        if (data.permissions) {
          setPermissions({ ...DEFAULT_PERMISSIONS, ...data.permissions });
        }
        setHistory(data.optimizations || data.history || []);
      } catch (err) {
        console.error("[SelfOptimizeSection] Load error:", {
          error: err instanceof Error ? err.message : err,
        });
        setError(err instanceof Error ? err.message : "Nieznany blad");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function togglePermission(
    key: string,
    field: "with_approval" | "autonomous",
  ) {
    setPermissions((prev) => {
      const entry = prev[key] || { with_approval: false, autonomous: false };
      const updated = { ...entry };

      if (field === "autonomous") {
        updated.autonomous = !updated.autonomous;
        // If autonomous is checked, with_approval must also be checked
        if (updated.autonomous) {
          updated.with_approval = true;
        }
      } else {
        updated.with_approval = !updated.with_approval;
        // If with_approval is unchecked, autonomous must also be unchecked
        if (!updated.with_approval) {
          updated.autonomous = false;
        }
      }

      return { ...prev, [key]: updated };
    });
  }

  async function savePermissions() {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const res = await fetch("/api/settings/optimizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[SelfOptimizeSection] Save error:", {
        error: err instanceof Error ? err.message : err,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(
    action: "approve" | "reject" | "rollback",
    id: string,
  ) {
    try {
      setActionLoading(id);
      const res = await fetch("/api/settings/optimizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Akcja nie powiodla sie");
      }
      // Refresh history
      const refreshRes = await fetch("/api/settings/optimizations");
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setHistory(data.optimizations || data.history || []);
      }
    } catch (err) {
      console.error("[SelfOptimizeSection] Action error:", {
        error: err instanceof Error ? err.message : err,
        action,
        id,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Auto-optymalizacja IORS
        </CardTitle>
        <CardDescription>
          Zdecyduj co IORS moze zmieniac samodzielnie, a co wymaga Twojej zgody
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Permissions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">
                      Parametr
                    </th>
                    <th className="text-center py-2 px-2 font-medium whitespace-nowrap">
                      Za moja zgoda
                    </th>
                    <th className="text-center py-2 px-2 font-medium whitespace-nowrap">
                      Samodzielnie
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((group) => (
                    <Fragment key={group.label}>
                      <tr>
                        <td
                          colSpan={3}
                          className="pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                          {group.label}
                        </td>
                      </tr>
                      {group.rows.map((row) => {
                        const perm = permissions[row.key] || {
                          with_approval: false,
                          autonomous: false,
                        };
                        return (
                          <tr
                            key={row.key}
                            className="border-b border-muted/50 hover:bg-muted/30"
                          >
                            <td className="py-2 pr-4">{row.label}</td>
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded"
                                checked={perm.with_approval}
                                disabled={perm.autonomous}
                                onChange={() =>
                                  togglePermission(row.key, "with_approval")
                                }
                              />
                            </td>
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded"
                                checked={perm.autonomous}
                                onChange={() =>
                                  togglePermission(row.key, "autonomous")
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={savePermissions} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz uprawnienia"}
              </Button>
              {saved && (
                <span className="text-sm text-green-600">Zapisano</span>
              )}
            </div>

            {/* Optimization History */}
            {history.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Historia optymalizacji
                </p>
                <div className="space-y-2">
                  {history.map((entry) => {
                    const badge =
                      STATUS_BADGE[entry.status] || STATUS_BADGE.applied;
                    return (
                      <div
                        key={entry.id}
                        className="p-3 bg-muted/50 rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={badge.className}
                            >
                              {badge.label}
                            </Badge>
                            <span className="text-sm font-medium">
                              {entry.description || entry.parameter}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString(
                              "pl-PL",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {entry.before_state} → {entry.after_state}
                        </p>
                        <div className="flex gap-2">
                          {entry.status === "proposed" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === entry.id}
                                onClick={() =>
                                  handleAction("approve", entry.id)
                                }
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Zatwierdz
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === entry.id}
                                onClick={() => handleAction("reject", entry.id)}
                              >
                                <X className="w-3 h-3 mr-1" />
                                Odrzuc
                              </Button>
                            </>
                          )}
                          {entry.status === "applied" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionLoading === entry.id}
                              onClick={() => handleAction("rollback", entry.id)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Cofnij
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
