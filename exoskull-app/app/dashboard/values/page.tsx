"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TreePine,
  Plus,
  Loader2,
  Pencil,
  Save,
  X,
  Target,
  Folder,
  FileText,
  Swords,
  StickyNote,
  Maximize2,
  Minimize2,
  RotateCcw,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

// Dynamic import to avoid SSR issues with WebGL-based lib
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400 mx-auto mb-3" />
        <p className="text-sm text-indigo-300/60">Budowanie grafu 3D...</p>
      </div>
    </div>
  ),
});

// ============================================================================
// TYPES
// ============================================================================

interface ChallengeData {
  id: string;
  title: string;
  status: string;
  difficulty: number;
  due_date: string | null;
  notes_count: number;
}

interface MissionData {
  id: string;
  title: string;
  status: string;
  total_ops: number;
  completed_ops: number;
  challenges_count: number;
  challenges: ChallengeData[];
}

interface QuestData {
  id: string;
  title: string;
  status: string;
  ops_count: number;
  notes_count: number;
  missions_count: number;
  missions: MissionData[];
}

interface LoopData {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  questCount: number;
  notes_count: number;
  quests?: QuestData[];
}

interface ValueData {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  priority: number;
  is_default: boolean;
  notes_count: number;
  loops: LoopData[];
}

interface GraphNode {
  id: string;
  name: string;
  type: "value" | "loop" | "quest" | "mission" | "challenge" | "notes";
  color: string;
  size: number;
  icon?: string | null;
  rawId?: string;
  opacity?: number;
  // Extra data for sidebar
  parentName?: string;
  description?: string | null;
  priority?: number;
  status?: string;
  difficulty?: number;
  notes_count?: number;
}

interface GraphLink {
  source: string;
  target: string;
  color?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_COLORS = [
  "#10B981",
  "#6366F1",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

const TYPE_LABELS: Record<string, string> = {
  value: "Wartosc",
  loop: "Biegun",
  quest: "Quest",
  mission: "Misja",
  challenge: "Wyzwanie",
  notes: "Notatki",
};

const TYPE_SIZES: Record<string, number> = {
  value: 20,
  loop: 12,
  quest: 7,
  mission: 5,
  challenge: 3.5,
  notes: 2,
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ValuesPage() {
  const [values, setValues] = useState<ValueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    icon: "",
    priority: 5,
  });
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const fetchValues = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/canvas/data/values?deep=true");
      if (res.ok) {
        const data = await res.json();
        setValues(data.values || []);
      }
    } catch (err) {
      console.error("[Values] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchValues();
  }, [fetchValues]);

  // Build graph data with full hierarchy (Values > Loops > Quests > Missions > Challenges)
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    values.forEach((v, i) => {
      const color = v.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

      // Value node (largest, glowing core)
      nodes.push({
        id: `v-${v.id}`,
        name: `${v.icon || ""} ${v.name}`.trim(),
        type: "value",
        color,
        size: TYPE_SIZES.value + v.priority,
        icon: v.icon,
        rawId: v.id,
        description: v.description,
        priority: v.priority,
        notes_count: v.notes_count,
      });

      v.loops.forEach((loop) => {
        const loopId = `l-${loop.id}`;

        // Loop/Area node (medium)
        nodes.push({
          id: loopId,
          name: `${loop.icon || ""} ${loop.name}`.trim(),
          type: "loop",
          color,
          size: TYPE_SIZES.loop,
          icon: loop.icon,
          rawId: loop.id,
          parentName: v.name,
          notes_count: loop.notes_count,
        });
        links.push({
          source: `v-${v.id}`,
          target: loopId,
          color: `${color}66`,
        });

        // Quests
        if (loop.quests && loop.quests.length > 0) {
          loop.quests.forEach((quest) => {
            const questId = `q-${quest.id}`;
            nodes.push({
              id: questId,
              name: quest.title,
              type: "quest",
              color,
              size: TYPE_SIZES.quest + Math.min(quest.ops_count, 4),
              rawId: quest.id,
              parentName: loop.name,
              status: quest.status,
              notes_count: quest.notes_count,
            });
            links.push({
              source: loopId,
              target: questId,
              color: `${color}44`,
            });

            // Missions
            if (quest.missions && quest.missions.length > 0) {
              quest.missions.forEach((mission) => {
                const missionId = `m-${mission.id}`;
                nodes.push({
                  id: missionId,
                  name: mission.title,
                  type: "mission",
                  color,
                  size:
                    TYPE_SIZES.mission +
                    (mission.total_ops > 0
                      ? (mission.completed_ops / mission.total_ops) * 3
                      : 0),
                  rawId: mission.id,
                  parentName: quest.title,
                  status: mission.status,
                });
                links.push({
                  source: questId,
                  target: missionId,
                  color: `${color}33`,
                });

                // Challenges
                if (mission.challenges && mission.challenges.length > 0) {
                  mission.challenges.forEach((challenge) => {
                    const challengeId = `c-${challenge.id}`;
                    nodes.push({
                      id: challengeId,
                      name: challenge.title,
                      type: "challenge",
                      color,
                      size: TYPE_SIZES.challenge + challenge.difficulty * 0.5,
                      rawId: challenge.id,
                      parentName: mission.title,
                      status: challenge.status,
                      difficulty: challenge.difficulty,
                      notes_count: challenge.notes_count,
                    });
                    links.push({
                      source: missionId,
                      target: challengeId,
                      color: `${color}22`,
                    });

                    // Notes aggregate for challenge
                    if (challenge.notes_count > 0) {
                      const notesId = `n-c-${challenge.id}`;
                      nodes.push({
                        id: notesId,
                        name: `${challenge.notes_count} notatek`,
                        type: "notes",
                        color: `${color}88`,
                        size:
                          TYPE_SIZES.notes + Math.min(challenge.notes_count, 3),
                        parentName: challenge.title,
                        notes_count: challenge.notes_count,
                      });
                      links.push({
                        source: challengeId,
                        target: notesId,
                        color: `${color}15`,
                      });
                    }
                  });
                }
              });
            }
          });
        } else if (loop.questCount > 0) {
          // Aggregate quest node when deep data unavailable
          const questId = `qa-${loop.id}`;
          nodes.push({
            id: questId,
            name: `${loop.questCount} quest${loop.questCount > 1 ? "y" : ""}`,
            type: "quest",
            color,
            size: TYPE_SIZES.quest + Math.min(loop.questCount, 6),
          });
          links.push({
            source: loopId,
            target: questId,
            color: `${color}44`,
          });
        }
      });
    });

    return { nodes, links };
  }, [values]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      if (node.type === "value") {
        const v = values.find((vv) => `v-${vv.id}` === node.id);
        if (v) {
          setEditForm({
            name: v.name,
            description: v.description || "",
            icon: v.icon || "",
            priority: v.priority,
          });
        }
      }
    },
    [values],
  );

  const startEdit = useCallback(() => {
    if (selectedNode?.type === "value") {
      const rawId = selectedNode.id.replace("v-", "");
      setEditingId(rawId);
    }
  }, [selectedNode]);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/knowledge/values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valueId: editingId,
          tenantId: user.id,
          name: editForm.name,
          description: editForm.description || null,
          icon: editForm.icon || null,
          priority: editForm.priority,
        }),
      });

      if (res.ok) {
        toast.success("Wartosc zaktualizowana");
        setEditingId(null);
        fetchValues();
      } else {
        const err = await res.json();
        toast.error(err.error || "Blad zapisu");
      }
    } catch {
      toast.error("Blad sieci");
    } finally {
      setSaving(false);
    }
  }, [editingId, editForm, fetchValues]);

  const initDefaults = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/knowledge/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: user.id, initDefaults: true }),
      });

      if (res.ok) {
        toast.success("Wartosci domyslne utworzone");
        fetchValues();
      }
    } catch {
      toast.error("Blad inicjalizacji");
    }
  }, [fetchValues]);

  const resetCamera = useCallback(() => {
    if (graphRef.current?.cameraPosition) {
      graphRef.current.cameraPosition({ x: 0, y: 0, z: 400 });
    }
  }, []);

  // Stats
  const stats = useMemo(() => {
    const byType = (t: string) =>
      graphData.nodes.filter((n) => n.type === t).length;
    return {
      values: byType("value"),
      loops: byType("loop"),
      quests: byType("quest"),
      missions: byType("mission"),
      challenges: byType("challenge"),
    };
  }, [graphData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-indigo-300/60 text-sm">
            Ladowanie hierarchii wartosci...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isFullscreen ? "fixed inset-0 z-50" : "h-[calc(100vh-4rem)]"}`}
    >
      {/* Main 3D graph area */}
      <div className="flex-1 relative bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-hidden">
        {values.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="relative">
              <TreePine className="h-20 w-20 text-indigo-500/20 mb-6" />
              <div className="absolute inset-0 blur-2xl bg-indigo-500/10 rounded-full" />
            </div>
            <h2 className="text-2xl font-bold text-white/90 mb-2">
              Brak wartosci
            </h2>
            <p className="text-indigo-300/60 mb-8 text-center max-w-md leading-relaxed">
              Wartosci to najwyzszy poziom Twojej hierarchii zyciowej. Definiuja
              co jest dla Ciebie najwazniejsze. Cala struktura zycia buduje sie
              na nich.
            </p>
            <Button
              onClick={initDefaults}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
            >
              <Plus className="h-4 w-4 mr-2" />
              Utworz wartosci domyslne
            </Button>
          </div>
        ) : (
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            nodeLabel={(node: object) => {
              const n = node as GraphNode;
              return `<div style="background:rgba(0,0,0,0.85);padding:6px 10px;border-radius:6px;color:white;font-size:12px;border:1px solid ${n.color}40">
                <strong>${n.name}</strong><br/>
                <span style="opacity:0.7;font-size:10px">${TYPE_LABELS[n.type] || n.type}${n.status ? ` • ${n.status}` : ""}${n.notes_count ? ` • ${n.notes_count} notatek` : ""}</span>
              </div>`;
            }}
            nodeColor={(node: object) => (node as GraphNode).color}
            nodeOpacity={0.9}
            nodeRelSize={1}
            nodeVal={(node: object) => (node as GraphNode).size}
            nodeThreeObject={showLabels ? undefined : undefined}
            linkColor={(link: object) =>
              (link as GraphLink).color || "rgba(100,100,255,0.15)"
            }
            linkWidth={0.5}
            linkOpacity={0.4}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={0.8}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={(link: object) =>
              (link as GraphLink).color || "rgba(100,100,255,0.3)"
            }
            onNodeClick={(node: object) => handleNodeClick(node as GraphNode)}
            backgroundColor="rgba(0,0,0,0)"
            showNavInfo={false}
            cooldownTime={4000}
            warmupTicks={50}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Header overlay */}
        <div className="absolute top-4 left-4 z-10">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-white/90">
            <TreePine className="h-6 w-6 text-emerald-400" />
            Drzewo wartosci
            <Badge
              variant="outline"
              className="text-xs text-indigo-300/80 border-indigo-500/30 ml-2"
            >
              3D
            </Badge>
          </h1>
          <p className="text-sm text-indigo-300/50 mt-1">
            {stats.values} wartosci / {stats.loops} biegunow / {stats.quests}{" "}
            questow / {stats.missions} misji / {stats.challenges} wyzwan
          </p>
        </div>

        {/* Controls */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={resetCamera}
            className="text-white/60 hover:text-white hover:bg-white/10 backdrop-blur-sm"
            title="Resetuj kamere"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLabels(!showLabels)}
            className="text-white/60 hover:text-white hover:bg-white/10 backdrop-blur-sm"
            title="Przelacz etykiety"
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-white/60 hover:text-white hover:bg-white/10 backdrop-blur-sm"
            title={isFullscreen ? "Zamknij pelny ekran" : "Pelny ekran"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 text-xs bg-black/60 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10">
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30" />
            Wartosc
          </span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-3 h-3 rounded-full bg-emerald-500/60" />
            Biegun
          </span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
            Quest
          </span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-2 h-2 rounded-full bg-emerald-500/30" />
            Misja
          </span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/20" />
            Wyzwanie
          </span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="w-1 h-1 rounded-full bg-emerald-500/15" />
            Notatki
          </span>
        </div>
      </div>

      {/* Sidebar */}
      {selectedNode && (
        <div className="w-80 border-l border-white/10 bg-slate-900/95 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg truncate text-white/90">
              {selectedNode.name}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedNode(null);
                setEditingId(null);
              }}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Badge
              className="text-xs"
              style={{
                backgroundColor: `${selectedNode.color}20`,
                color: selectedNode.color,
                borderColor: `${selectedNode.color}40`,
              }}
            >
              {TYPE_LABELS[selectedNode.type] || selectedNode.type}
            </Badge>
            {selectedNode.status && (
              <Badge
                variant="outline"
                className="text-xs text-white/60 border-white/20"
              >
                {selectedNode.status}
              </Badge>
            )}
            {selectedNode.difficulty && (
              <Badge
                variant="outline"
                className="text-xs text-amber-400 border-amber-500/30"
              >
                Trudnosc: {selectedNode.difficulty}/5
              </Badge>
            )}
          </div>

          {selectedNode.parentName && (
            <p className="text-xs text-white/40 mb-3">
              W: {selectedNode.parentName}
            </p>
          )}

          {/* VALUE DETAIL */}
          {selectedNode.type === "value" && (
            <>
              {editingId ? (
                <div className="space-y-3 mt-2">
                  <div>
                    <label className="text-xs text-white/50">Nazwa</label>
                    <input
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50">Opis</label>
                    <textarea
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white resize-none focus:border-indigo-500 focus:outline-none"
                      rows={3}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-white/50">Ikona</label>
                      <input
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        value={editForm.icon}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, icon: e.target.value }))
                        }
                        placeholder="np. 💚"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-white/50">Priorytet</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        value={editForm.priority}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            priority: parseInt(e.target.value) || 5,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      disabled={saving}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Zapisz
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      className="border-white/20 text-white/70 hover:bg-white/10"
                    >
                      Anuluj
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  {(() => {
                    const v = values.find(
                      (vv) => `v-${vv.id}` === selectedNode.id,
                    );
                    if (!v) return null;
                    return (
                      <>
                        {v.description && (
                          <p className="text-sm text-white/60 mb-3 leading-relaxed">
                            {v.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xs text-white/40">
                            Priorytet:
                          </span>
                          <Badge
                            variant="outline"
                            className="text-white/70 border-white/20"
                          >
                            {v.priority}/10
                          </Badge>
                          {v.notes_count > 0 && (
                            <>
                              <span className="text-xs text-white/40">
                                Notatki:
                              </span>
                              <Badge
                                variant="outline"
                                className="text-white/70 border-white/20"
                              >
                                {v.notes_count}
                              </Badge>
                            </>
                          )}
                        </div>

                        {/* Loops with quests */}
                        {v.loops.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs text-white/40 mb-2 flex items-center gap-1">
                              <Folder className="h-3 w-3" />
                              Bieguny ({v.loops.length}):
                            </p>
                            <div className="space-y-2">
                              {v.loops.map((loop) => (
                                <div key={loop.id}>
                                  <div className="flex items-center justify-between text-sm py-1.5 px-2.5 rounded-lg bg-white/5 text-white/80">
                                    <span>
                                      {loop.icon || ""} {loop.name}
                                    </span>
                                    {loop.questCount > 0 && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs bg-white/10 text-white/60"
                                      >
                                        {loop.questCount}
                                      </Badge>
                                    )}
                                  </div>
                                  {loop.quests && loop.quests.length > 0 && (
                                    <div className="ml-3 mt-1 space-y-0.5">
                                      {loop.quests.map((quest) => (
                                        <div
                                          key={quest.id}
                                          className="flex items-center gap-1.5 text-xs text-white/50 py-0.5 px-1"
                                        >
                                          <Target className="h-2.5 w-2.5 shrink-0 text-white/30" />
                                          <span className="truncate flex-1">
                                            {quest.title}
                                          </span>
                                          {quest.ops_count > 0 && (
                                            <span className="text-[10px] bg-white/10 px-1 rounded tabular-nums">
                                              {quest.ops_count} ops
                                            </span>
                                          )}
                                          {quest.missions &&
                                            quest.missions.length > 0 && (
                                              <span className="text-[10px] bg-white/10 px-1 rounded tabular-nums">
                                                {quest.missions.length} misje
                                              </span>
                                            )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-4 border-white/20 text-white/70 hover:bg-white/10"
                          onClick={startEdit}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edytuj
                        </Button>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {/* LOOP DETAIL */}
          {selectedNode.type === "loop" && (
            <div className="mt-2">
              {(() => {
                const loop = values
                  .flatMap((v) => v.loops)
                  .find((l) => `l-${l.id}` === selectedNode.id);
                if (!loop) return null;
                return (
                  <>
                    <p className="text-sm text-white/50 mb-3 flex items-center gap-1.5">
                      <Folder className="h-3.5 w-3.5" />
                      Biegun
                    </p>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-white/40">Questy:</span>
                      <Badge
                        variant="outline"
                        className="text-white/70 border-white/20"
                      >
                        {loop.questCount}
                      </Badge>
                    </div>
                    {loop.quests && loop.quests.length > 0 && (
                      <div className="space-y-1">
                        {loop.quests.map((quest) => (
                          <div
                            key={quest.id}
                            className="flex items-center justify-between text-sm py-1.5 px-2.5 rounded-lg bg-white/5"
                          >
                            <span className="flex items-center gap-1.5 text-white/80">
                              <Target className="h-3 w-3 text-white/40" />
                              {quest.title}
                            </span>
                            <div className="flex gap-1">
                              {quest.ops_count > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-white/10 text-white/50"
                                >
                                  {quest.ops_count} ops
                                </Badge>
                              )}
                              {quest.missions_count > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-white/10 text-white/50"
                                >
                                  {quest.missions_count} misje
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* QUEST DETAIL */}
          {selectedNode.type === "quest" && (
            <div className="mt-2">
              <p className="text-sm text-white/50 flex items-center gap-1.5 mb-3">
                <Target className="h-3.5 w-3.5" />
                Quest
              </p>
              {selectedNode.notes_count !== undefined &&
                selectedNode.notes_count > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="h-3 w-3 text-white/30" />
                    <span className="text-xs text-white/50">
                      {selectedNode.notes_count} notatek
                    </span>
                  </div>
                )}
            </div>
          )}

          {/* MISSION DETAIL */}
          {selectedNode.type === "mission" && (
            <div className="mt-2">
              <p className="text-sm text-white/50 flex items-center gap-1.5 mb-3">
                <FileText className="h-3.5 w-3.5" />
                Misja
              </p>
            </div>
          )}

          {/* CHALLENGE DETAIL */}
          {selectedNode.type === "challenge" && (
            <div className="mt-2">
              <p className="text-sm text-white/50 flex items-center gap-1.5 mb-3">
                <Swords className="h-3.5 w-3.5" />
                Wyzwanie
              </p>
              {selectedNode.notes_count !== undefined &&
                selectedNode.notes_count > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="h-3 w-3 text-white/30" />
                    <span className="text-xs text-white/50">
                      {selectedNode.notes_count} notatek
                    </span>
                  </div>
                )}
            </div>
          )}

          {/* Path breadcrumb at bottom */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
              Sciezka hierarchii
            </p>
            <p className="text-xs text-white/50">
              {selectedNode.type === "value" && "Wartosc"}
              {selectedNode.type === "loop" &&
                `Wartosc > ${selectedNode.parentName || "?"}`}
              {selectedNode.type === "quest" &&
                `Wartosc > Biegun > ${selectedNode.name}`}
              {selectedNode.type === "mission" &&
                `... > Quest > ${selectedNode.name}`}
              {selectedNode.type === "challenge" &&
                `... > Misja > ${selectedNode.name}`}
              {selectedNode.type === "notes" && `... > Wyzwanie > Notatki`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
