import { useMemo, useCallback, useEffect, useSyncExternalStore } from "react";
import { DEMO_WORLDS } from "@/lib/worlds/demo-worlds";
import type { OrbNode, OrbNodeType } from "@/lib/types/orb-types";

// ─── Singleton store for OrbNode tree ───

let _tree: OrbNode[] = buildDemoTree();
let _listeners: Set<() => void> = new Set();
let _fetched = false;
let _fetching = false;

function emitChange() {
  _listeners.forEach((fn) => fn());
}

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSnapshot(): OrbNode[] {
  return _tree;
}

function setTree(updater: (prev: OrbNode[]) => OrbNode[]) {
  _tree = updater(_tree);
  emitChange();
}

// ─── API → OrbNode transformation ───

interface ApiChallenge {
  id: string;
  title: string;
  status: string;
  difficulty: number;
  due_date: string | null;
  notes_count: number;
}

interface ApiMission {
  id: string;
  title: string;
  status: string;
  total_ops: number;
  completed_ops: number;
  challenges_count: number;
  challenges: ApiChallenge[];
}

interface ApiQuest {
  id: string;
  title: string;
  status: string;
  ops_count: number;
  notes_count: number;
  missions_count: number;
  missions: ApiMission[];
}

interface ApiLoop {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  notes_count: number;
  questCount: number;
  quests?: ApiQuest[];
}

interface ApiValue {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  priority: number;
  is_default: boolean;
  notes_count: number;
  loops: ApiLoop[];
}

function statusToOrb(s: string): string {
  const map: Record<string, string> = {
    active: "active",
    draft: "pending",
    paused: "blocked",
    completed: "done",
    archived: "done",
    pending: "pending",
    dropped: "done",
    blocked: "blocked",
  };
  return map[s] || "pending";
}

function priorityToOrb(p: number): OrbNode["priority"] {
  if (p >= 8) return "critical";
  if (p >= 6) return "high";
  if (p >= 4) return "medium";
  return "low";
}

function difficultyToPriority(d: number): OrbNode["priority"] {
  if (d >= 5) return "critical";
  if (d >= 4) return "high";
  if (d >= 3) return "medium";
  return "low";
}

function transformApiToOrbTree(values: ApiValue[]): OrbNode[] {
  return values.map((v) => ({
    id: v.id,
    label: v.name,
    color: v.color || "#888888",
    type: "value" as OrbNodeType,
    description: v.description,
    priority: priorityToOrb(v.priority || 5),
    meta: { icon: v.icon, notes_count: v.notes_count },
    children: (v.loops || []).map((l) => ({
      id: l.id,
      label: l.name,
      color: l.color || v.color || "#888888",
      type: "loop" as OrbNodeType,
      meta: { slug: l.slug, icon: l.icon, notes_count: l.notes_count },
      children: (l.quests || []).map((q) => ({
        id: q.id,
        label: q.title,
        color: l.color || v.color || "#888888",
        type: "quest" as OrbNodeType,
        status: statusToOrb(q.status),
        progress:
          q.ops_count > 0
            ? Math.round(
                ((q.ops_count - (q.ops_count || 0)) / q.ops_count) * 100,
              )
            : undefined,
        meta: { ops_count: q.ops_count, notes_count: q.notes_count },
        children: (q.missions || []).map((m) => ({
          id: m.id,
          label: m.title,
          color: shiftColor(l.color || v.color || "#888888", 15),
          type: "mission" as OrbNodeType,
          status: statusToOrb(m.status),
          progress:
            m.total_ops > 0
              ? Math.round((m.completed_ops / m.total_ops) * 100)
              : undefined,
          children: (m.challenges || []).map((c) => ({
            id: c.id,
            label: c.title,
            color: shiftColor(l.color || v.color || "#888888", 30),
            type: "challenge" as OrbNodeType,
            status: statusToOrb(c.status),
            dueDate: c.due_date || undefined,
            priority: difficultyToPriority(c.difficulty),
            meta: { notes_count: c.notes_count },
            children: [] as OrbNode[],
            childrenLoaded: false, // ops loaded lazily
          })),
          childrenLoaded: true,
        })),
        childrenLoaded: true,
      })),
      childrenLoaded: true,
    })),
    childrenLoaded: true,
  }));
}

// ─── Fetch from API ───

async function fetchOrbTree() {
  if (_fetching || _fetched) return;
  _fetching = true;
  try {
    const res = await fetch("/api/canvas/data/values?deep=true");
    if (!res.ok) return;
    const data = await res.json();
    const values: ApiValue[] = data.values;
    if (!values || values.length === 0) return;

    const tree = transformApiToOrbTree(values);
    _tree = tree;
    _fetched = true;
    emitChange();
  } catch (err) {
    console.error("[useOrbData] Failed to fetch hierarchy:", err);
    // Keep demo tree as fallback
  } finally {
    _fetching = false;
  }
}

// ─── Lazy-load ops for a challenge node ───

async function fetchOpsForChallenge(
  challengeId: string,
  challengeColor: string,
): Promise<OrbNode[]> {
  try {
    // We can't pass tenantId from client easily — use the auth-based knowledge API
    // The ops endpoint needs tenantId, so we'll use a dedicated query
    const res = await fetch(`/api/canvas/data/ops?challengeId=${challengeId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const ops: Array<{
      id: string;
      title: string;
      status: string;
      priority: number;
      due_date: string | null;
      description: string | null;
    }> = data.ops || [];

    return ops.map((op, i) => ({
      id: op.id,
      label: op.title,
      color: shiftColor(challengeColor, i * 15),
      type: "op" as OrbNodeType,
      status: statusToOrb(op.status),
      description: op.description || undefined,
      dueDate: op.due_date || undefined,
      priority: priorityToOrb(op.priority || 5),
      children: [],
      childrenLoaded: true, // ops are leaves
    }));
  } catch {
    return [];
  }
}

// ─── Demo fallback tree (from DEMO_WORLDS) ───

function buildDemoTree(): OrbNode[] {
  return DEMO_WORLDS.map((world) => ({
    id: world.id,
    label: world.name,
    color: world.color,
    type: "value" as OrbNodeType,
    children: (world.moons || []).map((moon) => ({
      id: moon.id,
      label: moon.name,
      color: world.color,
      type: "loop" as OrbNodeType,
      children: [],
      childrenLoaded: false,
    })),
    childrenLoaded: true,
  }));
}

// ─── Demo children fallback (when API has no data for a level) ───

function generateDemoChildren(
  parentId: string,
  parentColor: string,
  parentType: OrbNodeType,
): OrbNode[] {
  const childTypeMap: Record<string, OrbNodeType | undefined> = {
    value: "loop",
    loop: "quest",
    quest: "mission",
    mission: "challenge",
    challenge: "op",
  };

  const childType = childTypeMap[parentType];
  if (!childType) return [];

  const demoLabels: Record<OrbNodeType, string[]> = {
    value: [],
    loop: [],
    quest: ["Quest A", "Quest B", "Quest C"],
    mission: ["Misja 1", "Misja 2"],
    challenge: ["Wyzwanie 1", "Wyzwanie 2", "Wyzwanie 3"],
    op: ["Zadanie 1", "Zadanie 2"],
  };

  const labels = demoLabels[childType] || ["Item 1", "Item 2"];

  return labels.map((label, i) => ({
    id: `${parentId}-${childType}-${i}`,
    label,
    color: shiftColor(parentColor, i * 20),
    type: childType,
    status: ["active", "in-progress", "pending"][i % 3],
    children: [],
    childrenLoaded: false,
  }));
}

// ─── Color shift utility ───

function shiftColor(hex: string, degrees: number): string {
  if (!hex || hex.length < 7) return hex || "#888888";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  h = (h + degrees / 360) % 1;
  if (h < 0) h += 1;

  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  let rr: number, gg: number, bb: number;
  if (s === 0) {
    rr = gg = bb = l;
  } else {
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q2;
    rr = hue2rgb(p, q2, h + 1 / 3);
    gg = hue2rgb(p, q2, h);
    bb = hue2rgb(p, q2, h - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

function buildNodeMap(nodes: OrbNode[]): Map<string, OrbNode> {
  const map = new Map<string, OrbNode>();
  function walk(node: OrbNode) {
    map.set(node.id, node);
    node.children.forEach(walk);
  }
  nodes.forEach(walk);
  return map;
}

// ─── Hook ───

/**
 * Hook: provides recursive OrbNode data.
 * Fetches from /api/canvas/data/values?deep=true on first mount.
 * Falls back to DEMO_WORLDS while loading or if API fails.
 */
export function useOrbData() {
  const tree = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Trigger API fetch on first mount
  useEffect(() => {
    fetchOrbTree();
  }, []);

  const nodeMap = useMemo(() => buildNodeMap(tree), [tree]);

  const getNode = useCallback(
    (id: string): OrbNode | null => {
      return nodeMap.get(id) ?? null;
    },
    [nodeMap],
  );

  const loadChildren = useCallback((nodeId: string) => {
    setTree((prev) => {
      function updateNode(nodes: OrbNode[]): OrbNode[] {
        return nodes.map((n) => {
          if (n.id === nodeId && !n.childrenLoaded) {
            // For challenge nodes, trigger async ops fetch
            if (n.type === "challenge") {
              // Mark as loading, then fetch async
              setTimeout(async () => {
                const ops = await fetchOpsForChallenge(n.id, n.color);
                if (ops.length > 0) {
                  setTree((p) => {
                    function setOps(ns: OrbNode[]): OrbNode[] {
                      return ns.map((nd) => {
                        if (nd.id === nodeId) {
                          return { ...nd, children: ops, childrenLoaded: true };
                        }
                        if (nd.children.length > 0) {
                          return { ...nd, children: setOps(nd.children) };
                        }
                        return nd;
                      });
                    }
                    return setOps(p);
                  });
                } else {
                  // No ops from API — use demo fallback
                  setTree((p) => {
                    function setDemo(ns: OrbNode[]): OrbNode[] {
                      return ns.map((nd) => {
                        if (nd.id === nodeId && !nd.childrenLoaded) {
                          return {
                            ...nd,
                            children: generateDemoChildren(
                              nd.id,
                              nd.color,
                              nd.type,
                            ),
                            childrenLoaded: true,
                          };
                        }
                        if (nd.children.length > 0) {
                          return { ...nd, children: setDemo(nd.children) };
                        }
                        return nd;
                      });
                    }
                    return setDemo(p);
                  });
                }
              }, 0);
              // Return node marked as loaded (prevents double-fetch)
              return { ...n, childrenLoaded: true };
            }

            // For non-challenge nodes, use demo children as fallback
            const children = generateDemoChildren(n.id, n.color, n.type);
            return { ...n, children, childrenLoaded: true };
          }
          if (n.children.length > 0) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      }
      return updateNode(prev);
    });
  }, []);

  /** Force re-fetch from API (e.g. after data mutation) */
  const refresh = useCallback(() => {
    _fetched = false;
    _fetching = false;
    fetchOrbTree();
  }, []);

  return {
    rootNodes: tree,
    getNode,
    loadChildren,
    refresh,
    isLive: _fetched,
  };
}
