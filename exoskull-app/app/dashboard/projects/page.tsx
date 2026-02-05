"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Loader2,
  Archive,
  CheckCircle2,
  ListTodo,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: string;
  color: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: {
    label: "Aktywny",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  completed: {
    label: "Ukonczony",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  archived: {
    label: "Zarchiwizowany",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchProjects = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch projects
      const { data: projectsData, error } = await supabase
        .from("exo_projects")
        .select("*")
        .eq("tenant_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ProjectsPage] Fetch error:", error);
        return;
      }

      // Get task counts per project
      const projectIds = (projectsData || []).map((p) => p.id);
      if (projectIds.length > 0) {
        const { data: taskCounts } = await supabase
          .from("exo_tasks")
          .select("project_id")
          .in("project_id", projectIds)
          .not("status", "eq", "cancelled");

        const countMap: Record<string, number> = {};
        (taskCounts || []).forEach((t) => {
          if (t.project_id) {
            countMap[t.project_id] = (countMap[t.project_id] || 0) + 1;
          }
        });

        setProjects(
          (projectsData || []).map((p) => ({
            ...p,
            task_count: countMap[p.id] || 0,
          })),
        );
      } else {
        setProjects(projectsData || []);
      }
    } catch (error) {
      console.error("[ProjectsPage] Fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription || undefined,
          color: newColor,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewDescription("");
        setNewColor("#6366f1");
        setShowCreate(false);
        await fetchProjects();
      } else {
        const err = await res.json();
        console.error("[ProjectsPage] Create error:", err);
      }
    } catch (error) {
      console.error("[ProjectsPage] Create error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (projectId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("exo_projects")
        .update({ status: "archived" })
        .eq("id", projectId);

      if (error) {
        console.error("[ProjectsPage] Archive error:", error);
        return;
      }
      await fetchProjects();
    } catch (error) {
      console.error("[ProjectsPage] Archive error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const activeProjects = projects.filter((p) => p.status === "active");
  const archivedProjects = projects.filter((p) => p.status === "archived");
  const totalTasks = projects.reduce((sum, p) => sum + (p.task_count || 0), 0);

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="w-7 h-7" />
            Projekty
          </h1>
          <p className="text-muted-foreground">Organizuj zadania w projekty</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nowy projekt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy projekt</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nazwa</label>
                <Input
                  placeholder="np. Aplikacja mobilna"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Opis</label>
                <Textarea
                  placeholder="Opcjonalny opis projektu..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Kolor</label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newColor === c
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Anuluj
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Utworz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeProjects.length}</p>
                <p className="text-sm text-muted-foreground">
                  Aktywne projekty
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <ListTodo className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalTasks}</p>
                <p className="text-sm text-muted-foreground">
                  Zadan w projektach
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900/30">
                <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{archivedProjects.length}</p>
                <p className="text-sm text-muted-foreground">Zarchiwizowane</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Projects */}
      {activeProjects.length === 0 && archivedProjects.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Brak projektow</h3>
            <p className="text-muted-foreground mb-4">
              Utworz pierwszy projekt aby organizowac zadania
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nowy projekt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Aktywne</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeProjects.map((project) => (
                  <Card
                    key={project.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium">{project.name}</h3>
                          {project.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-3">
                            <Badge variant="secondary" className="text-xs">
                              <ListTodo className="w-3 h-3 mr-1" />
                              {project.task_count || 0} zadan
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(project.created_at).toLocaleDateString(
                                "pl-PL",
                              )}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleArchive(project.id)}
                          title="Archiwizuj"
                        >
                          <Archive className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {archivedProjects.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">
                Zarchiwizowane ({archivedProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedProjects.map((project) => (
                  <Card key={project.id} className="opacity-60">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium">{project.name}</h3>
                          <Badge
                            variant="outline"
                            className="text-xs mt-1 border-0 bg-gray-100 dark:bg-gray-900/30"
                          >
                            Zarchiwizowany
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
