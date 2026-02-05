"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Pencil,
  Scale,
  Settings2,
  Heart,
} from "lucide-react";
import type { AutonomyData } from "./useAutonomyData";
import type { UserValueUI } from "./types";

interface Props {
  data: AutonomyData;
}

export function GuardianTab({ data }: Props) {
  const { guardianData, updateValue, resolveConflict, updateGuardianConfig } =
    data;

  // Value editor
  const [editValue, setEditValue] = useState<UserValueUI | null>(null);
  const [showAddValue, setShowAddValue] = useState(false);
  const [newValueArea, setNewValueArea] = useState("");
  const [newValueImportance, setNewValueImportance] = useState("0.5");
  const [newValueDesc, setNewValueDesc] = useState("");

  // Conflict resolution
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  // Config
  const [configEditing, setConfigEditing] = useState(false);
  const [configMaxPerDay, setConfigMaxPerDay] = useState("");
  const [configCooldown, setConfigCooldown] = useState("");
  const [configMinBenefit, setConfigMinBenefit] = useState("");
  const [configSaved, setConfigSaved] = useState(false);

  if (!guardianData) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Ladowanie danych guardiana...</p>
      </div>
    );
  }

  const { values, config, stats, conflicts } = guardianData;
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved);

  const handleAddValue = async () => {
    if (!newValueArea.trim()) return;
    await updateValue(
      newValueArea,
      parseFloat(newValueImportance),
      newValueDesc,
    );
    setNewValueArea("");
    setNewValueImportance("0.5");
    setNewValueDesc("");
    setShowAddValue(false);
  };

  const handleEditValue = async () => {
    if (!editValue) return;
    await updateValue(
      editValue.value_area,
      editValue.importance,
      editValue.description || "",
    );
    setEditValue(null);
  };

  const handleResolveConflict = async (conflictId: string) => {
    const resolution = resolutions[conflictId];
    if (!resolution?.trim()) return;
    await resolveConflict(conflictId, resolution);
    setResolutions((prev) => {
      const next = { ...prev };
      delete next[conflictId];
      return next;
    });
  };

  const openConfigEdit = () => {
    setConfigMaxPerDay(config.max_interventions_per_day.toString());
    setConfigCooldown(config.cooldown_minutes.toString());
    setConfigMinBenefit(config.min_benefit_score.toString());
    setConfigEditing(true);
    setConfigSaved(false);
  };

  const handleSaveConfig = async () => {
    await updateGuardianConfig({
      max_interventions_per_day: parseInt(configMaxPerDay) || undefined,
      cooldown_minutes: parseInt(configCooldown) || undefined,
      min_benefit_score: parseFloat(configMinBenefit) || undefined,
    });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Guardian Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats.today_approved}
            </p>
            <p className="text-xs text-muted-foreground">Zatwierdzone dzis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {stats.today_blocked}
            </p>
            <p className="text-xs text-muted-foreground">Zablokowane dzis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {stats.avg_effectiveness !== null
                ? `${stats.avg_effectiveness}/10`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Srednia skutecznosc</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total_measured}</p>
            <p className="text-xs text-muted-foreground">Zmierzone</p>
          </CardContent>
        </Card>
      </div>

      {/* User Values */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" />
              Twoje wartosci
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddValue(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Dodaj
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {values.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Brak zdefiniowanych wartosci. Dodaj to co jest dla Ciebie wazne.
            </p>
          ) : (
            values.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm capitalize">
                      {v.value_area}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs border-0 bg-muted"
                    >
                      {(v.importance * 10).toFixed(0)}/10
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs border-0 bg-muted"
                    >
                      {v.source}
                    </Badge>
                    {v.drift_detected && (
                      <Badge
                        variant="outline"
                        className="text-xs border-0 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Drift
                      </Badge>
                    )}
                  </div>
                  {v.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {v.description}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditValue({ ...v })}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Value Dialog */}
      <Dialog open={showAddValue} onOpenChange={setShowAddValue}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa wartosc</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Obszar</Label>
              <Input
                placeholder="np. health, family, career, creativity"
                value={newValueArea}
                onChange={(e) => setNewValueArea(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Waznosc (0-1)</Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={newValueImportance}
                onChange={(e) => setNewValueImportance(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opis</Label>
              <Textarea
                placeholder="Co oznacza ta wartosc dla Ciebie?"
                value={newValueDesc}
                onChange={(e) => setNewValueDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddValue(false)}>
              Anuluj
            </Button>
            <Button onClick={handleAddValue} disabled={!newValueArea.trim()}>
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Value Dialog */}
      <Dialog open={!!editValue} onOpenChange={(o) => !o && setEditValue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj: {editValue?.value_area}</DialogTitle>
          </DialogHeader>
          {editValue && (
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Waznosc (0-1)</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editValue.importance}
                  onChange={(e) =>
                    setEditValue({
                      ...editValue,
                      importance: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Opis</Label>
                <Textarea
                  value={editValue.description || ""}
                  onChange={(e) =>
                    setEditValue({ ...editValue, description: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditValue(null)}>
              Anuluj
            </Button>
            <Button onClick={handleEditValue}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Value Conflicts */}
      {unresolvedConflicts.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-yellow-500" />
              Konflikty wartosci ({unresolvedConflicts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unresolvedConflicts.map((c) => (
              <div key={c.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {c.value_a}
                  </Badge>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <Badge variant="outline" className="text-xs capitalize">
                    {c.value_b}
                  </Badge>
                </div>
                <p className="text-sm">{c.conflict_description}</p>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Jak chcesz rozwiazac ten konflikt?"
                    value={resolutions[c.id] || ""}
                    onChange={(e) =>
                      setResolutions((p) => ({ ...p, [c.id]: e.target.value }))
                    }
                    className="text-sm h-16"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleResolveConflict(c.id)}
                    disabled={!resolutions[c.id]?.trim()}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Rozwiaz
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Throttle Config */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Limity i konfiguracja
            </CardTitle>
            {!configEditing && (
              <Button size="sm" variant="outline" onClick={openConfigEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                Edytuj
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {configEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Max interwencji / dzien</Label>
                  <Input
                    type="number"
                    value={configMaxPerDay}
                    onChange={(e) => setConfigMaxPerDay(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cooldown (min)</Label>
                  <Input
                    type="number"
                    value={configCooldown}
                    onChange={(e) => setConfigCooldown(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Min benefit score</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={configMinBenefit}
                    onChange={(e) => setConfigMinBenefit(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveConfig}>Zapisz</Button>
                <Button
                  variant="outline"
                  onClick={() => setConfigEditing(false)}
                >
                  Anuluj
                </Button>
                {configSaved && (
                  <span className="text-sm text-green-600">Zapisano</span>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Max / dzien</p>
                <p className="text-lg font-bold">
                  {config.max_interventions_per_day}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Cooldown</p>
                <p className="text-lg font-bold">
                  {config.cooldown_minutes} min
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Min benefit</p>
                <p className="text-lg font-bold">
                  {config.min_benefit_score}/10
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
