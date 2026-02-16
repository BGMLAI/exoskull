import { useMemo, useCallback, useSyncExternalStore } from "react";
import { DEMO_WORLDS } from "@/lib/worlds/demo-worlds";
import type { OrbNode, OrbNodeType } from "@/lib/types/orb-types";

// ─── Singleton store for OrbNode tree ───
// Shared across all components that call useOrbData()

let _tree: OrbNode[] = buildOrbTree();
let _listeners: Set<() => void> = new Set();

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

// ─── Demo data generation ───

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

  const demoData: Record<
    OrbNodeType,
    Array<{
      label: string;
      desc?: string;
      due?: string;
      prio?: "low" | "medium" | "high" | "critical";
      prog?: number;
      img?: string;
    }>
  > = {
    value: [],
    loop: [],
    quest: [
      {
        label: "Zbuduj rutynę poranną",
        desc: "Pobudka + medytacja + ruch",
        due: "2026-03-01",
        prio: "high",
        prog: 40,
        img: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=100&h=100&fit=crop",
      },
      {
        label: "Optymalizuj regenerację",
        desc: "Sen + suplementacja + cold exposure",
        due: "2026-03-15",
        prio: "medium",
        prog: 20,
        img: "https://images.unsplash.com/photo-1531353826977-0941b4779a1c?w=100&h=100&fit=crop",
      },
      {
        label: "Tracking nawyków",
        desc: "Codzienne logowanie kluczowych metryk",
        due: "2026-02-28",
        prio: "high",
        prog: 65,
        img: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=100&h=100&fit=crop",
      },
    ],
    mission: [
      {
        label: "Wdrożenie trackera snu",
        desc: "Automatyczne logowanie z Oura Ring",
        due: "2026-02-25",
        prio: "high",
        prog: 80,
        img: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=100&h=100&fit=crop",
      },
      {
        label: "Plan treningowy Q1",
        desc: "3x siłownia + 2x cardio tygodniowo",
        due: "2026-03-31",
        prio: "medium",
        prog: 30,
        img: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&h=100&fit=crop",
      },
    ],
    challenge: [
      {
        label: "7 dni bez ekranów po 21:00",
        desc: "Blue light blocker + czytanie",
        prio: "high",
        img: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=100&h=100&fit=crop",
      },
      {
        label: "30 dni medytacji",
        desc: "Min 10 min dziennie, rano",
        prio: "medium",
        prog: 50,
        img: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=100&h=100&fit=crop",
      },
      {
        label: "Cold shower streak",
        desc: "Min 2 minuty zimnego prysznica",
        prio: "low",
        img: "https://images.unsplash.com/photo-1564419320461-6262a488cd8d?w=100&h=100&fit=crop",
      },
    ],
    op: [
      {
        label: "Zainstaluj Oura Ring app",
        prio: "low",
        img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=100&h=100&fit=crop",
      },
      { label: "Skonfiguruj alarm na 6:00", due: "2026-02-17", prio: "medium" },
    ],
  };

  const items = demoData[childType] || [
    { label: "Item 1" },
    { label: "Item 2" },
  ];

  return items.map((item, i) => ({
    id: `${parentId}-${childType}-${i}`,
    label: item.label,
    color: shiftColor(parentColor, i * 20),
    type: childType,
    status: ["active", "in-progress", "done", "pending", "blocked"][i % 5],
    description: item.desc,
    dueDate: item.due,
    priority: item.prio,
    progress: item.prog,
    imageUrl: item.img,
    children: [],
    childrenLoaded: false,
  }));
}

function shiftColor(hex: string, degrees: number): string {
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

function buildOrbTree(): OrbNode[] {
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
 * Uses singleton state so all components share the same tree.
 */
export function useOrbData() {
  const tree = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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

  return {
    rootNodes: tree,
    getNode,
    loadChildren,
  };
}
