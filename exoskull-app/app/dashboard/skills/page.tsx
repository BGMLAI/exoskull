"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Shield,
  Clock,
  Archive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Database,
  Globe,
  Bell,
} from "lucide-react";
import { SkillSuggestionsWidget } from "@/components/skills/SkillSuggestionsWidget";

// ============================================================================
// TYPES
// ============================================================================

type SkillSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  tier: string;
  risk_level: "low" | "medium" | "high";
  capabilities: {
    database: string[];
    tables: string[];
    notifications: boolean;
    externalApi: boolean;
  };
  approval_status: "pending" | "approved" | "rejected" | "revoked";
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG = {
  pending: {
    label: "Oczekuje",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  approved: {
    label: "Aktywny",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  rejected: {
    label: "Odrzucony",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  revoked: {
    label: "Cofniety",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
};

const RISK_CONFIG = {
  low: {
    label: "Niskie",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  medium: {
    label: "Srednie",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  high: {
    label: "Wysokie",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function SkillsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);

  // Generate dialog state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [generateDescription, setGenerateDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);
    await loadSkills(user.id);
  }

  const loadSkills = useCallback(
    async (tenantId: string) => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("exo_generated_skills")
          .select(
            "id, slug, name, description, version, tier, risk_level, capabilities, approval_status, usage_count, last_used_at, created_at, updated_at, archived_at",
          )
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[Skills] Load error:", error);
          return;
        }
        setSkills(data || []);
      } catch (error) {
        console.error("[Skills] Load error:", error);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  async function handleGenerate() {
    if (!userId || !generateDescription.trim()) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch("/api/skills/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: generateDescription.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGenerateError(data.error || "Generowanie nie powiodlo sie");
        return;
      }

      setIsGenerateOpen(false);
      setGenerateDescription("");
      await loadSkills(userId);

      // Navigate to the new skill
      if (data.skill?.id) {
        router.push(`/dashboard/skills/${data.skill.id}`);
      }
    } catch (error) {
      console.error("[Skills] Generate error:", error);
      setGenerateError("Blad polaczenia z serwerem");
    } finally {
      setGenerating(false);
    }
  }

  async function handleArchive(skillId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!userId) return;
    if (!confirm("Czy na pewno chcesz zarchiwizowac ten skill?")) return;

    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadSkills(userId);
      }
    } catch (error) {
      console.error("[Skills] Archive error:", error);
    }
  }

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    if (filterStatus !== "all" && skill.approval_status !== filterStatus)
      return false;
    return true;
  });

  // Stats
  const stats = {
    total: skills.length,
    active: skills.filter((s) => s.approval_status === "approved").length,
    pending: skills.filter((s) => s.approval_status === "pending").length,
    rejected: skills.filter((s) => s.approval_status === "rejected").length,
  };

  return (
    <div className="p-4 md:p-8 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dynamiczne Skille</h1>
          <p className="text-muted-foreground">
            Generuj, zatwierdzaj i zarzadzaj niestandardowymi modami
          </p>
        </div>
        <Dialog
          open={isGenerateOpen}
          onOpenChange={(open) => {
            setIsGenerateOpen(open);
            if (!open) {
              setGenerateDescription("");
              setGenerateError(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Sparkles className="mr-2 h-4 w-4" />
              Generuj Skill
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Generuj nowy Skill</DialogTitle>
              <DialogDescription>
                Opisz co chcesz sledzic lub automatyzowac. AI wygeneruje kod,
                ktory przejdzie walidacje i bedzie czekac na Twoje
                zatwierdzenie.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">Opis skilla *</Label>
                <Textarea
                  id="description"
                  value={generateDescription}
                  onChange={(e) => setGenerateDescription(e.target.value)}
                  placeholder="np. Chce sledzic ile wody wypijam dziennie - szklanki, czas, cel 8 szklanek..."
                  rows={4}
                  disabled={generating}
                />
              </div>
              {generateError && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {generateError}
                </div>
              )}
              {generating && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generowanie kodu... To moze zajac 10-30 sekund.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsGenerateOpen(false)}
                disabled={generating}
              >
                Anuluj
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || generateDescription.trim().length < 5}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generowanie...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generuj
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Wszystkie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Aktywne
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4 text-yellow-600" />
              Oczekujace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-red-600" />
              Odrzucone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Skill Suggestions */}
      {userId && (
        <SkillSuggestionsWidget
          userId={userId}
          onSuggestionAccepted={() => userId && loadSkills(userId)}
        />
      )}

      {/* Filter */}
      <div className="flex gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="approved">Aktywne</SelectItem>
            <SelectItem value="pending">Oczekujace</SelectItem>
            <SelectItem value="rejected">Odrzucone</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Skills List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Ladowanie skilli...
            </CardContent>
          </Card>
        ) : filteredSkills.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-medium mb-1">Brak skilli</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Wygeneruj pierwszy skill, aby rozszerzyc mozliwosci ExoSkull.
              </p>
              <Button onClick={() => setIsGenerateOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generuj pierwszy Skill
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredSkills.map((skill) => (
            <Card
              key={skill.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/skills/${skill.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* Title row */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{skill.name}</h3>
                      <Badge
                        className={STATUS_CONFIG[skill.approval_status]?.color}
                      >
                        {STATUS_CONFIG[skill.approval_status]?.label}
                      </Badge>
                      <Badge className={RISK_CONFIG[skill.risk_level]?.color}>
                        <Shield className="h-3 w-3 mr-1" />
                        {RISK_CONFIG[skill.risk_level]?.label}
                      </Badge>
                    </div>

                    {/* Description */}
                    {skill.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                    )}

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{skill.slug}</span>
                      <span>v{skill.version}</span>

                      {/* Capabilities */}
                      {skill.capabilities?.database?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          {skill.capabilities.database.join("/")}
                        </span>
                      )}
                      {skill.capabilities?.externalApi && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          API
                        </span>
                      )}
                      {skill.capabilities?.notifications && (
                        <span className="flex items-center gap-1">
                          <Bell className="h-3 w-3" />
                          Notif.
                        </span>
                      )}

                      {skill.usage_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {skill.usage_count}x
                        </span>
                      )}

                      <span>
                        {new Date(skill.created_at).toLocaleDateString("pl-PL")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleArchive(skill.id, e)}
                    title="Archiwizuj"
                  >
                    <Archive className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
