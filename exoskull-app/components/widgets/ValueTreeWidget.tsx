"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TreePine,
  RefreshCw,
  ChevronRight,
  Target,
  Folder,
  Swords,
  StickyNote,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================================================
// TYPES
// ============================================================================

interface ChallengeNode {
  id: string;
  title: string;
  status: string;
  difficulty: number;
  notes_count: number;
}

interface MissionNode {
  id: string;
  title: string;
  status: string;
  total_ops: number;
  completed_ops: number;
  challenges_count: number;
  challenges: ChallengeNode[];
}

interface QuestNode {
  id: string;
  title: string;
  status: string;
  ops_count: number;
  notes_count: number;
  missions_count: number;
  missions: MissionNode[];
}

interface LoopNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  questCount: number;
  notes_count: number;
  quests?: QuestNode[];
}

interface ValueNode {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  priority: number;
  notes_count: number;
  loops: LoopNode[];
}

// ============================================================================
// DEFAULT COLORS (when user hasn't set one)
// ============================================================================

const DEFAULT_COLORS = [
  "#10B981", // emerald
  "#6366F1", // indigo
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
];

// ============================================================================
// COMPONENT
// ============================================================================

export function ValueTreeWidget() {
  const [values, setValues] = useState<ValueNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const [expandedLoops, setExpandedLoops] = useState<Set<string>>(new Set());
  const [expandedQuests, setExpandedQuests] = useState<Set<string>>(new Set());
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(
    new Set(),
  );

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/canvas/data/values?deep=true");
      if (res.ok) {
        const data = await res.json();
        setValues(data.values || []);
      }
    } catch (err) {
      console.error("[ValueTree] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 120_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggle = useCallback(
    (
      set: Set<string>,
      setter: React.Dispatch<React.SetStateAction<Set<string>>>,
      id: string,
    ) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
                <div className="flex-1 h-3 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Totals for summary
  const totalLoops = values.reduce((sum, v) => sum + v.loops.length, 0);
  const totalQuests = values.reduce(
    (sum, v) => sum + v.loops.reduce((ls, l) => ls + l.questCount, 0),
    0,
  );
  const totalMissions = values.reduce(
    (sum, v) =>
      sum +
      v.loops.reduce(
        (ls, l) =>
          ls +
          (l.quests || []).reduce((qs, q) => qs + (q.missions?.length || 0), 0),
        0,
      ),
    0,
  );
  const totalChallenges = values.reduce(
    (sum, v) =>
      sum +
      v.loops.reduce(
        (ls, l) =>
          ls +
          (l.quests || []).reduce(
            (qs, q) =>
              qs +
              (q.missions || []).reduce(
                (ms, m) => ms + (m.challenges?.length || 0),
                0,
              ),
            0,
          ),
        0,
      ),
    0,
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-emerald-500" />
            Drzewo wartosci
          </span>
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard/values"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Widok 3D"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <button
              onClick={() => fetchData(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Odswiez"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
        {values.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <TreePine className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Brak zdefiniowanych wartosci.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Porozmawiaj z IORS o tym, co jest dla Ciebie najwazniejsze.
            </p>
          </div>
        ) : (
          <>
            {/* Summary ring */}
            <div className="flex items-center justify-center mb-4">
              <svg viewBox="0 0 120 120" width={100} height={100}>
                {/* Background ring */}
                <circle
                  cx={60}
                  cy={60}
                  r={50}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-muted/30"
                />
                {/* Value segments */}
                {values.map((v, i) => {
                  const total = values.reduce((s, vv) => s + vv.priority, 0);
                  const startAngle = values
                    .slice(0, i)
                    .reduce((s, vv) => s + (vv.priority / total) * 360, 0);
                  const sweepAngle = (v.priority / total) * 360;
                  const startRad = ((startAngle - 90) * Math.PI) / 180;
                  const endRad =
                    ((startAngle + sweepAngle - 90) * Math.PI) / 180;
                  const largeArc = sweepAngle > 180 ? 1 : 0;
                  const x1 = 60 + 50 * Math.cos(startRad);
                  const y1 = 60 + 50 * Math.sin(startRad);
                  const x2 = 60 + 50 * Math.cos(endRad);
                  const y2 = 60 + 50 * Math.sin(endRad);
                  const color =
                    v.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

                  return (
                    <path
                      key={v.id}
                      d={`M ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  );
                })}
                {/* Center text */}
                <text
                  x={60}
                  y={55}
                  textAnchor="middle"
                  className="fill-foreground text-xl font-bold"
                  fontSize={20}
                >
                  {values.length}
                </text>
                <text
                  x={60}
                  y={72}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                  fontSize={9}
                >
                  {totalLoops}a / {totalQuests}q / {totalMissions}m /{" "}
                  {totalChallenges}c
                </text>
              </svg>
            </div>

            {/* Hierarchical value list: Values > Loops > Quests > Missions > Challenges */}
            <div className="space-y-0.5">
              {values.map((v, i) => {
                const color =
                  v.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                const isExpanded = expandedValues.has(v.id);

                return (
                  <div key={v.id}>
                    {/* Value row */}
                    <button
                      onClick={() =>
                        toggle(expandedValues, setExpandedValues, v.id)
                      }
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm flex-1 truncate">
                        {v.icon || ""} {v.name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {v.priority}/10
                      </span>
                      {v.notes_count > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {v.notes_count}n
                        </span>
                      )}
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </button>

                    {/* Expanded: Loops under this value */}
                    {isExpanded && v.loops.length > 0 && (
                      <div className="ml-5 border-l border-muted pl-2 space-y-0.5 pb-1">
                        {v.loops.map((loop) => {
                          const loopExpanded = expandedLoops.has(loop.id);
                          return (
                            <div key={loop.id}>
                              <button
                                onClick={() =>
                                  toggle(
                                    expandedLoops,
                                    setExpandedLoops,
                                    loop.id,
                                  )
                                }
                                className="w-full flex items-center gap-1.5 text-xs py-1 px-1 rounded hover:bg-muted/30 transition-colors text-left"
                              >
                                <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate flex-1">
                                  {loop.icon || ""} {loop.name}
                                </span>
                                {loop.questCount > 0 && (
                                  <span className="text-[10px] bg-muted px-1 rounded tabular-nums">
                                    {loop.questCount}
                                  </span>
                                )}
                                {loop.questCount > 0 && (
                                  <ChevronRight
                                    className={cn(
                                      "h-2.5 w-2.5 text-muted-foreground/60 transition-transform",
                                      loopExpanded && "rotate-90",
                                    )}
                                  />
                                )}
                              </button>

                              {/* Quests under this loop */}
                              {loopExpanded &&
                                loop.quests &&
                                loop.quests.length > 0 && (
                                  <div className="ml-4 border-l border-muted/50 pl-2 space-y-0.5 pb-0.5">
                                    {loop.quests.map((quest) => {
                                      const questExpanded = expandedQuests.has(
                                        quest.id,
                                      );
                                      return (
                                        <div key={quest.id}>
                                          <button
                                            onClick={() =>
                                              toggle(
                                                expandedQuests,
                                                setExpandedQuests,
                                                quest.id,
                                              )
                                            }
                                            className="w-full flex items-center gap-1 text-[11px] text-muted-foreground py-0.5 px-1 rounded hover:bg-muted/20 transition-colors text-left"
                                          >
                                            <Target className="h-2.5 w-2.5 shrink-0" />
                                            <span className="truncate flex-1">
                                              {quest.title}
                                            </span>
                                            {quest.ops_count > 0 && (
                                              <span className="text-[9px] bg-muted/50 px-0.5 rounded tabular-nums">
                                                {quest.ops_count}
                                              </span>
                                            )}
                                            {quest.missions &&
                                              quest.missions.length > 0 && (
                                                <ChevronRight
                                                  className={cn(
                                                    "h-2 w-2 text-muted-foreground/40 transition-transform",
                                                    questExpanded &&
                                                      "rotate-90",
                                                  )}
                                                />
                                              )}
                                          </button>

                                          {/* Missions under this quest */}
                                          {questExpanded &&
                                            quest.missions &&
                                            quest.missions.length > 0 && (
                                              <div className="ml-3 border-l border-muted/30 pl-2 space-y-0.5 pb-0.5">
                                                {quest.missions.map(
                                                  (mission) => {
                                                    const missionExpanded =
                                                      expandedMissions.has(
                                                        mission.id,
                                                      );
                                                    const progress =
                                                      mission.total_ops > 0
                                                        ? Math.round(
                                                            (mission.completed_ops /
                                                              mission.total_ops) *
                                                              100,
                                                          )
                                                        : 0;

                                                    return (
                                                      <div key={mission.id}>
                                                        <button
                                                          onClick={() =>
                                                            toggle(
                                                              expandedMissions,
                                                              setExpandedMissions,
                                                              mission.id,
                                                            )
                                                          }
                                                          className="w-full flex items-center gap-1 text-[10px] text-muted-foreground/80 py-0.5 px-1 rounded hover:bg-muted/15 transition-colors text-left"
                                                        >
                                                          <FileText className="h-2 w-2 shrink-0" />
                                                          <span className="truncate flex-1">
                                                            {mission.title}
                                                          </span>
                                                          {mission.total_ops >
                                                            0 && (
                                                            <span className="text-[9px] tabular-nums">
                                                              {progress}%
                                                            </span>
                                                          )}
                                                          {mission.challenges &&
                                                            mission.challenges
                                                              .length > 0 && (
                                                              <ChevronRight
                                                                className={cn(
                                                                  "h-2 w-2 text-muted-foreground/30 transition-transform",
                                                                  missionExpanded &&
                                                                    "rotate-90",
                                                                )}
                                                              />
                                                            )}
                                                        </button>

                                                        {/* Challenges under mission */}
                                                        {missionExpanded &&
                                                          mission.challenges &&
                                                          mission.challenges
                                                            .length > 0 && (
                                                            <div className="ml-3 border-l border-muted/20 pl-1.5 space-y-0.5 pb-0.5">
                                                              {mission.challenges.map(
                                                                (challenge) => (
                                                                  <div
                                                                    key={
                                                                      challenge.id
                                                                    }
                                                                    className="flex items-center gap-1 text-[9px] text-muted-foreground/60 py-0.5 px-0.5"
                                                                  >
                                                                    <Swords className="h-2 w-2 shrink-0" />
                                                                    <span className="truncate flex-1">
                                                                      {
                                                                        challenge.title
                                                                      }
                                                                    </span>
                                                                    {challenge.difficulty >
                                                                      1 && (
                                                                      <span className="text-[8px] text-amber-500/60">
                                                                        {
                                                                          challenge.difficulty
                                                                        }
                                                                        /5
                                                                      </span>
                                                                    )}
                                                                    {challenge.notes_count >
                                                                      0 && (
                                                                      <StickyNote className="h-1.5 w-1.5 text-muted-foreground/40" />
                                                                    )}
                                                                  </div>
                                                                ),
                                                              )}
                                                            </div>
                                                          )}
                                                      </div>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isExpanded && v.loops.length === 0 && (
                      <p className="ml-7 text-xs text-muted-foreground/60 py-1">
                        Brak powiazanych biegunow
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
