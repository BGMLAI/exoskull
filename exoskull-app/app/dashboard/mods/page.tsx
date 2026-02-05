"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Puzzle,
  Download,
  CheckCircle2,
  Package,
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ModRegistry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  config: Record<string, unknown>;
  is_template: boolean;
  created_at: string;
}

interface InstalledMod {
  id: string;
  active: boolean;
  installed_at: string;
  mod: ModRegistry;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  health: "Zdrowie",
  productivity: "Produktywnosc",
  finance: "Finanse",
  growth: "Rozwoj",
  relationships: "Relacje",
  wellbeing: "Wellbeing",
};

const CATEGORY_COLORS: Record<string, string> = {
  health:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  productivity:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  finance:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  growth:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  relationships:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  wellbeing: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ModsPage() {
  const router = useRouter();
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([]);
  const [allTemplates, setAllTemplates] = useState<ModRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

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

      // Fetch installed mods + all templates in parallel
      const [installedRes, templatesRes] = await Promise.all([
        fetch("/api/mods"),
        supabase
          .from("exo_mod_registry")
          .select("*")
          .eq("is_template", true)
          .order("category", { ascending: true }),
      ]);

      const installedJson = await installedRes.json();
      setInstalledMods(installedJson.mods || []);

      if (templatesRes.data) {
        setAllTemplates(templatesRes.data);
      }
    } catch (error) {
      console.error("[ModsPage] Fetch error:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleInstall = async (slug: string) => {
    setInstalling(slug);
    try {
      const res = await fetch("/api/mods/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        console.error("[ModsPage] Install error:", { slug, error: err });
      }
    } catch (error) {
      console.error("[ModsPage] Install error:", {
        slug,
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setInstalling(null);
    }
  };

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const installedSlugs = new Set(
    installedMods.map((m) => m.mod?.slug).filter(Boolean),
  );
  const activeMods = installedMods.filter((m) => m.active);
  const availableTemplates = allTemplates.filter(
    (t) => !installedSlugs.has(t.slug),
  );

  const filteredInstalled = filter === "available" ? [] : installedMods;
  const filteredAvailable = filter === "installed" ? [] : availableTemplates;

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exoskulleton</h1>
          <p className="text-muted-foreground">
            Mody rozszerzaja mozliwosci Twojego ExoSkull
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{installedMods.length}</p>
                <p className="text-sm text-muted-foreground">Zainstalowane</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Power className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeMods.length}</p>
                <p className="text-sm text-muted-foreground">Aktywne</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Download className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {availableTemplates.length}
                </p>
                <p className="text-sm text-muted-foreground">Dostepne</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtruj" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="installed">Zainstalowane</SelectItem>
            <SelectItem value="available">Dostepne</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Installed Mods */}
      {filteredInstalled.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Moje Mody</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInstalled.map((im) => {
              const mod = im.mod;
              if (!mod) return null;
              return (
                <Card
                  key={im.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/dashboard/mods/${mod.slug}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{mod.icon || "📦"}</span>
                        <div>
                          <h3 className="font-medium">{mod.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                      {im.active ? (
                        <Badge
                          variant="outline"
                          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0"
                        >
                          <Power className="w-3 h-3 mr-1" />
                          On
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400 border-0"
                        >
                          <PowerOff className="w-3 h-3 mr-1" />
                          Off
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {mod.category && (
                        <Badge
                          variant="outline"
                          className={`border-0 text-xs ${CATEGORY_COLORS[mod.category] || ""}`}
                        >
                          {CATEGORY_LABELS[mod.category] || mod.category}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Zainstalowano{" "}
                        {new Date(im.installed_at).toLocaleDateString("pl-PL")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Marketplace */}
      {filteredAvailable.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Marketplace</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAvailable.map((template) => (
              <Card key={template.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{template.icon || "📦"}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{template.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {template.category && (
                          <Badge
                            variant="outline"
                            className={`border-0 text-xs ${CATEGORY_COLORS[template.category] || ""}`}
                          >
                            {CATEGORY_LABELS[template.category] ||
                              template.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-3"
                    disabled={installing === template.slug}
                    onClick={() => handleInstall(template.slug)}
                  >
                    {installing === template.slug ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Instalowanie...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Zainstaluj
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty States */}
      {filter === "installed" && filteredInstalled.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Puzzle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              Brak zainstalowanych modow
            </h3>
            <p className="text-muted-foreground mb-4">
              Przejrzyj marketplace i zainstaluj pierwszy mod
            </p>
            <Button variant="outline" onClick={() => setFilter("available")}>
              Przejrzyj marketplace
            </Button>
          </CardContent>
        </Card>
      )}

      {filter === "available" && filteredAvailable.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">
              Wszystko zainstalowane!
            </h3>
            <p className="text-muted-foreground">
              Masz juz wszystkie dostepne mody
            </p>
          </CardContent>
        </Card>
      )}

      {filter === "all" &&
        installedMods.length === 0 &&
        allTemplates.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Puzzle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Brak modow</h3>
              <p className="text-muted-foreground">
                Mody pojawia sie wkrotce. System jest w trakcie budowy.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
