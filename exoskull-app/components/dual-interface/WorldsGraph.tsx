/**
 * WorldsGraph — 6 Worlds of TAU visualization
 *
 * Right panel of the TAU Dual Interface.
 *
 *   Y-axis: Analogowe/Ja (top) ↔ Cyfrowe/IORS (bottom)
 *   X-axis: Znane (left)        ↔ Nieznane (right)
 *
 *   human-internal (Emerald)     human-external (Amber)
 *         shared-internal (Rose) · shared-external (Cyan)
 *   iors-known (Violet)          iors-unknown (Blue)
 *
 * Poles are rendered as large glowing circles (not stars).
 * Completed nodes are crystalline hexagons with bloom.
 * FractalPattern mandala overlays the background.
 */
"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import dynamic from "next/dynamic";
import {
  useInterfaceStore,
  type WorldId,
  type FocusedNode,
  WORLD_COLORS,
} from "@/lib/stores/useInterfaceStore";
import { FractalPattern } from "./FractalPattern";
import { cn } from "@/lib/utils";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  MessageCircle,
  Layers,
  Globe,
  Brain,
  Cpu,
  Compass,
  Heart,
  Sparkles,
} from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#050510]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        <span className="text-xs text-white/40">Ładowanie światów...</span>
      </div>
    </div>
  ),
});

// ===========================================================================
// TYPES
// ===========================================================================

export type WorldNodeType =
  | "world-region"
  | "pole"
  | "loop"
  | "campaign"
  | "quest"
  | "op"
  | "task"
  | "value"
  | "skill"
  | "knowledge";

export interface WorldNode {
  id: string;
  name: string;
  type: WorldNodeType;
  worldId: WorldId;
  color?: string;
  size?: number;
  parent?: string;
  completed?: boolean;
  metadata?: Record<string, unknown>;
  fx?: number;
  fy?: number;
}

export interface WorldLink {
  source: string;
  target: string;
  type?: "hierarchy" | "influence" | "dependency" | "reference";
  strength?: number;
}

interface WorldsGraphProps {
  nodes?: WorldNode[];
  links?: WorldLink[];
  onChatAboutNode?: (node: WorldNode) => void;
  className?: string;
}

// ===========================================================================
// WORLD CONFIGS
// ===========================================================================

interface WorldConfig {
  id: WorldId;
  name: string;
  description: string;
  color: string;
  position: { x: number; y: number };
  icon: React.ElementType;
}

const WORLDS: Record<WorldId, WorldConfig> = {
  "human-internal": {
    id: "human-internal",
    name: "Mój Wewnętrzny",
    description: "Wiedza, historia, wspomnienia, wartości",
    color: WORLD_COLORS["human-internal"],
    position: { x: -240, y: -190 },
    icon: Brain,
  },
  "human-external": {
    id: "human-external",
    name: "Mój Zewnętrzny",
    description: "Plany, wyzwania, komunikacja, świat fizyczny",
    color: WORLD_COLORS["human-external"],
    position: { x: 240, y: -190 },
    icon: Globe,
  },
  "iors-known": {
    id: "iors-known",
    name: "IORS Znany",
    description: "Umiejętności, narzędzia, API, frameworki",
    color: WORLD_COLORS["iors-known"],
    position: { x: -240, y: 190 },
    icon: Cpu,
  },
  "iors-unknown": {
    id: "iors-unknown",
    name: "IORS Nieznany",
    description: "Świat fizyczny, przyszłość, niezbadane",
    color: WORLD_COLORS["iors-unknown"],
    position: { x: 240, y: 190 },
    icon: Compass,
  },
  "shared-internal": {
    id: "shared-internal",
    name: "Wspólne Wnętrze",
    description: "Co obaj wiemy — wspólny kontekst i wzorce",
    color: WORLD_COLORS["shared-internal"],
    position: { x: -75, y: 0 },
    icon: Heart,
  },
  "shared-external": {
    id: "shared-external",
    name: "Wspólna Przyszłość",
    description: "Pożądany świat — cele, marzenia, projekty",
    color: WORLD_COLORS["shared-external"],
    position: { x: 75, y: 0 },
    icon: Sparkles,
  },
};

const NODE_SIZES: Record<WorldNodeType, number> = {
  "world-region": 0,
  pole: 18,
  loop: 12,
  campaign: 10,
  quest: 8,
  op: 6,
  task: 5,
  value: 10,
  skill: 8,
  knowledge: 7,
};

// ===========================================================================
// DEMO DATA
// ===========================================================================

function buildDemoData(): { nodes: WorldNode[]; links: WorldLink[] } {
  const nodes: WorldNode[] = [];
  const links: WorldLink[] = [];

  const add = (node: WorldNode, parentId?: string) => {
    nodes.push(node);
    if (parentId) {
      links.push({
        source: parentId,
        target: node.id,
        type: "hierarchy",
        strength: 0.7,
      });
    }
  };

  // Region anchors
  for (const w of Object.values(WORLDS)) {
    add({
      id: `region-${w.id}`,
      name: w.name,
      type: "world-region",
      worldId: w.id,
      color: w.color,
      fx: w.position.x,
      fy: w.position.y,
    });
  }

  // HUMAN EXTERNAL (Amber)
  const he = "human-external" as WorldId;
  add({
    id: `pole-${he}`,
    name: "Mój Świat",
    type: "pole",
    worldId: he,
    color: WORLDS[he].color,
    fx: WORLDS[he].position.x,
    fy: WORLDS[he].position.y,
  });
  add(
    { id: `${he}-planning`, name: "Planowanie", type: "loop", worldId: he },
    `pole-${he}`,
  );
  add(
    { id: `${he}-comms`, name: "Komunikacja", type: "loop", worldId: he },
    `pole-${he}`,
  );
  add(
    { id: `${he}-challenges`, name: "Wyzwania", type: "loop", worldId: he },
    `pole-${he}`,
  );
  add(
    {
      id: `${he}-morning`,
      name: "Poranna rutyna",
      type: "quest",
      worldId: he,
      completed: true,
    },
    `${he}-planning`,
  );
  add(
    {
      id: `${he}-evening`,
      name: "Wieczorna refleksja",
      type: "quest",
      worldId: he,
    },
    `${he}-planning`,
  );
  add(
    { id: `${he}-inbox`, name: "Inbox zero", type: "quest", worldId: he },
    `${he}-comms`,
  );
  add(
    {
      id: `${he}-calls`,
      name: "Ważne telefony",
      type: "task",
      worldId: he,
      completed: true,
    },
    `${he}-comms`,
  );
  add(
    { id: `${he}-marathon`, name: "Maraton prep", type: "quest", worldId: he },
    `${he}-challenges`,
  );
  add(
    {
      id: `${he}-cold`,
      name: "Zimny prysznic",
      type: "task",
      worldId: he,
      completed: true,
    },
    `${he}-challenges`,
  );

  // HUMAN INTERNAL (Emerald)
  const hi = "human-internal" as WorldId;
  add({
    id: `pole-${hi}`,
    name: "Moje Wnętrze",
    type: "pole",
    worldId: hi,
    color: WORLDS[hi].color,
    fx: WORLDS[hi].position.x,
    fy: WORLDS[hi].position.y,
  });
  add(
    { id: `${hi}-knowledge`, name: "Wiedza", type: "loop", worldId: hi },
    `pole-${hi}`,
  );
  add(
    { id: `${hi}-memories`, name: "Wspomnienia", type: "loop", worldId: hi },
    `pole-${hi}`,
  );
  add(
    { id: `${hi}-values`, name: "Wartości", type: "loop", worldId: hi },
    `pole-${hi}`,
  );
  add(
    {
      id: `${hi}-books`,
      name: "Przeczytane książki",
      type: "quest",
      worldId: hi,
      completed: true,
    },
    `${hi}-knowledge`,
  );
  add(
    {
      id: `${hi}-courses`,
      name: "Notatki z kursów",
      type: "quest",
      worldId: hi,
    },
    `${hi}-knowledge`,
  );
  add(
    {
      id: `${hi}-vacation`,
      name: "Wakacje 2025",
      type: "quest",
      worldId: hi,
      completed: true,
    },
    `${hi}-memories`,
  );
  add(
    { id: `${hi}-journal`, name: "Dziennik", type: "task", worldId: hi },
    `${hi}-memories`,
  );
  add(
    { id: `${hi}-health-v`, name: "Zdrowie", type: "value", worldId: hi },
    `${hi}-values`,
  );
  add(
    { id: `${hi}-freedom`, name: "Wolność", type: "value", worldId: hi },
    `${hi}-values`,
  );

  // IORS KNOWN (Violet)
  const ik = "iors-known" as WorldId;
  add({
    id: `pole-${ik}`,
    name: "IORS Znany",
    type: "pole",
    worldId: ik,
    color: WORLDS[ik].color,
    fx: WORLDS[ik].position.x,
    fy: WORLDS[ik].position.y,
  });
  add(
    { id: `${ik}-tools`, name: "Narzędzia", type: "loop", worldId: ik },
    `pole-${ik}`,
  );
  add(
    { id: `${ik}-skills`, name: "Skills", type: "loop", worldId: ik },
    `pole-${ik}`,
  );
  add(
    { id: `${ik}-apis`, name: "API Integrations", type: "loop", worldId: ik },
    `pole-${ik}`,
  );
  add(
    {
      id: `${ik}-supabase`,
      name: "Supabase",
      type: "skill",
      worldId: ik,
      completed: true,
    },
    `${ik}-tools`,
  );
  add(
    {
      id: `${ik}-nextjs`,
      name: "Next.js",
      type: "skill",
      worldId: ik,
      completed: true,
    },
    `${ik}-tools`,
  );
  add(
    {
      id: `${ik}-voice`,
      name: "Voice recognition",
      type: "skill",
      worldId: ik,
    },
    `${ik}-skills`,
  );
  add(
    { id: `${ik}-langchain`, name: "LangChain", type: "skill", worldId: ik },
    `${ik}-skills`,
  );
  add(
    {
      id: `${ik}-gmail`,
      name: "Gmail API",
      type: "quest",
      worldId: ik,
      completed: true,
    },
    `${ik}-apis`,
  );
  add(
    { id: `${ik}-calendar`, name: "Calendar sync", type: "quest", worldId: ik },
    `${ik}-apis`,
  );

  // IORS UNKNOWN (Blue)
  const iu = "iors-unknown" as WorldId;
  add({
    id: `pole-${iu}`,
    name: "IORS Nieznany",
    type: "pole",
    worldId: iu,
    color: WORLDS[iu].color,
    fx: WORLDS[iu].position.x,
    fy: WORLDS[iu].position.y,
  });
  add(
    { id: `${iu}-physical`, name: "Świat fizyczny", type: "loop", worldId: iu },
    `pole-${iu}`,
  );
  add(
    { id: `${iu}-future`, name: "Przyszłość", type: "loop", worldId: iu },
    `pole-${iu}`,
  );
  add(
    { id: `${iu}-unexplored`, name: "Niezbadane", type: "loop", worldId: iu },
    `pole-${iu}`,
  );
  add(
    { id: `${iu}-weather`, name: "Pogoda", type: "quest", worldId: iu },
    `${iu}-physical`,
  );
  add(
    {
      id: `${iu}-location`,
      name: "Lokalizacja",
      type: "knowledge",
      worldId: iu,
    },
    `${iu}-physical`,
  );
  add(
    {
      id: `${iu}-ai-trends`,
      name: "Trendy AI 2026",
      type: "quest",
      worldId: iu,
    },
    `${iu}-future`,
  );
  add(
    { id: `${iu}-quantum`, name: "Kwantowe ML", type: "quest", worldId: iu },
    `${iu}-unexplored`,
  );
  add(
    { id: `${iu}-bio`, name: "Bioinformatyka", type: "knowledge", worldId: iu },
    `${iu}-unexplored`,
  );

  // SHARED INTERNAL (Rose)
  const si = "shared-internal" as WorldId;
  add({
    id: `pole-${si}`,
    name: "Wspólne Wnętrze",
    type: "pole",
    worldId: si,
    color: WORLDS[si].color,
    fx: WORLDS[si].position.x,
    fy: WORLDS[si].position.y,
  });
  add(
    { id: `${si}-context`, name: "Kontekst rozmów", type: "loop", worldId: si },
    `pole-${si}`,
  );
  add(
    { id: `${si}-patterns`, name: "Wzorce", type: "loop", worldId: si },
    `pole-${si}`,
  );
  add(
    { id: `${si}-decisions`, name: "Decyzje", type: "loop", worldId: si },
    `pole-${si}`,
  );
  add(
    {
      id: `${si}-sleep`,
      name: "Wzorzec snu",
      type: "knowledge",
      worldId: si,
      completed: true,
    },
    `${si}-patterns`,
  );
  add(
    {
      id: `${si}-energy`,
      name: "Cykl energii",
      type: "knowledge",
      worldId: si,
    },
    `${si}-patterns`,
  );
  add(
    { id: `${si}-career`, name: "Decyzja kariery", type: "quest", worldId: si },
    `${si}-decisions`,
  );

  // SHARED EXTERNAL (Cyan)
  const se = "shared-external" as WorldId;
  add({
    id: `pole-${se}`,
    name: "Wspólna Przyszłość",
    type: "pole",
    worldId: se,
    color: WORLDS[se].color,
    fx: WORLDS[se].position.x,
    fy: WORLDS[se].position.y,
  });
  add(
    { id: `${se}-goals`, name: "Cele życiowe", type: "loop", worldId: se },
    `pole-${se}`,
  );
  add(
    { id: `${se}-dreams`, name: "Marzenia", type: "loop", worldId: se },
    `pole-${se}`,
  );
  add(
    { id: `${se}-projects`, name: "Projekty", type: "loop", worldId: se },
    `pole-${se}`,
  );
  add(
    { id: `${se}-passive`, name: "Pasywny dochód", type: "quest", worldId: se },
    `${se}-goals`,
  );
  add(
    {
      id: `${se}-health-g`,
      name: "Idealne zdrowie",
      type: "quest",
      worldId: se,
    },
    `${se}-goals`,
  );
  add(
    { id: `${se}-travel`, name: "Podróż dookoła", type: "quest", worldId: se },
    `${se}-dreams`,
  );
  add(
    { id: `${se}-exoskull`, name: "ExoSkull v2", type: "quest", worldId: se },
    `${se}-projects`,
  );

  // Cross-world links
  links.push(
    {
      source: `${hi}-health-v`,
      target: `${he}-marathon`,
      type: "influence",
      strength: 0.3,
    },
    {
      source: `${ik}-supabase`,
      target: `${se}-exoskull`,
      type: "dependency",
      strength: 0.3,
    },
    {
      source: `${si}-sleep`,
      target: `${he}-morning`,
      type: "influence",
      strength: 0.3,
    },
    {
      source: `${hi}-knowledge`,
      target: `${ik}-skills`,
      type: "reference",
      strength: 0.2,
    },
    {
      source: `${se}-goals`,
      target: `${he}-challenges`,
      type: "influence",
      strength: 0.3,
    },
    {
      source: `${si}-energy`,
      target: `${he}-planning`,
      type: "influence",
      strength: 0.2,
    },
  );

  return { nodes, links };
}

// ===========================================================================
// COMPONENT
// ===========================================================================

export function WorldsGraph({
  nodes: customNodes,
  links: customLinks,
  onChatAboutNode,
  className,
}: WorldsGraphProps) {
  const focusedNode = useInterfaceStore((s) => s.focusedNode);
  const setFocusedNode = useInterfaceStore((s) => s.setFocusedNode);
  const graphFilter = useInterfaceStore((s) => s.graphFilter);
  const setGraphFilter = useInterfaceStore((s) => s.setGraphFilter);
  const activeWorld = useInterfaceStore((s) => s.activeWorld);
  const setActiveWorld = useInterfaceStore((s) => s.setActiveWorld);
  const iorsActivity = useInterfaceStore((s) => s.iorsActivity);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Idle drift & IORS focus camera
  const lastInteraction = useRef(Date.now());
  const idleDriftAngle = useRef(0);
  const prevIorsActivity = useRef(iorsActivity);

  // ── Resize observer ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries)
        setDimensions({
          width: e.contentRect.width,
          height: e.contentRect.height,
        });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── d3 force customization ────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("center", null);
    const charge = fg.d3Force("charge");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (charge)
      charge.strength((n: any) =>
        n.type === "world-region"
          ? 0
          : n.type === "pole"
            ? -150
            : n.type === "loop"
              ? -60
              : -35,
      );
    const link = fg.d3Force("link");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (link)
      link.distance((l: any) => {
        const s = typeof l.source === "object" ? l.source : {};
        const t = typeof l.target === "object" ? l.target : {};
        if (s.type === "pole" || t.type === "pole") return 55;
        if (l.type === "influence" || l.type === "dependency") return 160;
        return 38;
      });
  }, []);

  // ── Interaction tracking ───────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const mark = () => {
      lastInteraction.current = Date.now();
    };
    el.addEventListener("pointerdown", mark);
    el.addEventListener("wheel", mark);
    el.addEventListener("touchstart", mark, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", mark);
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchstart", mark);
    };
  }, []);

  // ── Idle drift ─────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        Date.now() - lastInteraction.current > 8000 &&
        fgRef.current &&
        iorsActivity === "idle"
      ) {
        idleDriftAngle.current += 0.12;
        const poles = Object.values(WORLDS);
        const cx = poles.reduce((s, w) => s + w.position.x, 0) / poles.length;
        const cy = poles.reduce((s, w) => s + w.position.y, 0) / poles.length;
        fgRef.current.centerAt(
          cx + 35 * Math.cos(idleDriftAngle.current),
          cy + 35 * Math.sin(idleDriftAngle.current),
          4000,
        );
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [iorsActivity]);

  // ── Data ───────────────────────────────────────────────────────────
  const demoData = useMemo(() => buildDemoData(), []);
  const rawNodes = customNodes || demoData.nodes;
  const rawLinks = customLinks || demoData.links;

  const { filteredNodes, filteredLinks } = useMemo(() => {
    if (!graphFilter.trim())
      return { filteredNodes: rawNodes, filteredLinks: rawLinks };
    const q = graphFilter.toLowerCase();
    const ids = new Set<string>();
    for (const n of rawNodes) {
      if (
        n.name.toLowerCase().includes(q) ||
        n.type.includes(q) ||
        n.worldId.includes(q)
      ) {
        ids.add(n.id);
        let cur = rawNodes.find((x) => x.id === n.parent);
        while (cur) {
          ids.add(cur.id);
          cur = rawNodes.find((x) => x.id === cur!.parent);
        }
      }
    }
    for (const n of rawNodes)
      if (n.type === "world-region" || n.type === "pole") ids.add(n.id);
    return {
      filteredNodes: rawNodes.filter((n) => ids.has(n.id)),
      filteredLinks: rawLinks.filter(
        (l) => ids.has(l.source) && ids.has(l.target),
      ),
    };
  }, [rawNodes, rawLinks, graphFilter]);

  const graphData = useMemo(
    () => ({
      nodes: filteredNodes.map((n) => ({
        ...n,
        val:
          n.type === "world-region"
            ? 0.1
            : (n.size || NODE_SIZES[n.type] || 5) * (n.completed ? 1.3 : 1),
      })),
      links: filteredLinks.map((l) => ({ ...l })),
    }),
    [filteredNodes, filteredLinks],
  );

  // ── IORS focus camera ──────────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current) return;
    const wasIdle = prevIorsActivity.current === "idle";
    const isNowIdle = iorsActivity === "idle";
    prevIorsActivity.current = iorsActivity;
    if (!isNowIdle && wasIdle) {
      if (fgRef.current.zoom() < 1.5) fgRef.current.zoom(1.5, 1200);
      if (activeWorld) {
        const w = WORLDS[activeWorld];
        if (w) fgRef.current.centerAt(w.position.x, w.position.y, 1200);
      }
      lastInteraction.current = Date.now();
    } else if (isNowIdle && !wasIdle) {
      setTimeout(() => fgRef.current?.zoomToFit(1000, 60), 600);
    }
  }, [iorsActivity, activeWorld]);

  // ── Paint node (canvas) ────────────────────────────────────────────
  const paintNode = useCallback(
    (
      node: Record<string, unknown>,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const x = node.x as number;
      const y = node.y as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const type = node.type as WorldNodeType;
      const worldId = node.worldId as WorldId;
      const name = (node.name as string) || "";
      const completed = node.completed as boolean;
      const world = WORLDS[worldId];
      const color = (node.color as string) || world?.color || "#6B7280";
      const isHovered = node.id === hoveredNode;
      const isFocused = focusedNode?.id === node.id;
      const isActiveWorld = activeWorld === worldId;
      const t = Date.now() * 0.001;

      // ── WORLD REGION (nebula background) ─────────────────────────
      if (type === "world-region") {
        const baseR = 125;
        const pulse = baseR + Math.sin(t * 0.4 + x * 0.01) * 6;
        const r1 = Math.max(1, pulse * 1.4);
        const r2 = Math.max(1, pulse);

        const outer = ctx.createRadialGradient(x, y, 0, x, y, r1);
        outer.addColorStop(0, `${color}08`);
        outer.addColorStop(0.6, `${color}03`);
        outer.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, r1, 0, Math.PI * 2);
        ctx.fillStyle = outer;
        ctx.fill();

        const inner = ctx.createRadialGradient(x, y, 0, x, y, r2);
        inner.addColorStop(0, `${color}${isActiveWorld ? "10" : "08"}`);
        inner.addColorStop(0.7, `${color}${isActiveWorld ? "06" : "03"}`);
        inner.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, r2, 0, Math.PI * 2);
        ctx.fillStyle = inner;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r2 * 0.92, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}${isActiveWorld ? "18" : "0A"}`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (globalScale > 0.3) {
          const fs = Math.max(6, 8 / Math.sqrt(globalScale));
          ctx.font = `600 ${fs}px 'Inter', system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = `${color}${isActiveWorld ? "50" : "28"}`;
          ctx.fillText(name.toUpperCase(), x, y - pulse + 14);
        }
        return;
      }

      const baseSize = NODE_SIZES[type] || 5;
      const drawSize = baseSize * (completed ? 1.3 : 1);

      // ── POLE (large glowing circle) ──────────────────────────────
      if (type === "pole") {
        const polePhase = x * 0.01 + y * 0.01;
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.5 + polePhase);

        // Outer shimmer ring (per-world glow)
        const shimmerR = Math.max(1, drawSize * (4.5 + breathe * 1.5));
        const shimmerGrad = ctx.createRadialGradient(
          x,
          y,
          drawSize * 1.5,
          x,
          y,
          shimmerR,
        );
        shimmerGrad.addColorStop(
          0,
          `${color}${Math.round(breathe * 10 + 3)
            .toString(16)
            .padStart(2, "0")}`,
        );
        shimmerGrad.addColorStop(0.6, `${color}02`);
        shimmerGrad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, shimmerR, 0, Math.PI * 2);
        ctx.fillStyle = shimmerGrad;
        ctx.fill();

        // Pulsing glow halo
        const glowR = Math.max(
          1,
          drawSize * 3.5 * (1 + Math.sin(t * 1.2 + polePhase) * 0.12),
        );
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `${color}35`);
        glow.addColorStop(0.35, `${color}18`);
        glow.addColorStop(0.7, `${color}06`);
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Main circle (large, with gradient)
        const poleR = drawSize * 1.4;
        ctx.beginPath();
        ctx.arc(x, y, poleR, 0, Math.PI * 2);
        const poleFill = ctx.createRadialGradient(
          x - poleR * 0.2,
          y - poleR * 0.2,
          0,
          x,
          y,
          poleR,
        );
        poleFill.addColorStop(0, "#ffffff");
        poleFill.addColorStop(0.3, color);
        poleFill.addColorStop(1, `${color}BB`);
        ctx.fillStyle = poleFill;
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(
          x - poleR * 0.25,
          y - poleR * 0.25,
          poleR * 0.35,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();

        // Border
        ctx.beginPath();
        ctx.arc(x, y, poleR, 0, Math.PI * 2);
        ctx.strokeStyle = isFocused ? "#ffffff" : `${color}99`;
        ctx.lineWidth = isFocused ? 2.5 : 1;
        ctx.stroke();

        // Label
        if (globalScale > 0.2) {
          const fs = Math.max(5, 7 / Math.sqrt(globalScale));
          ctx.font = `700 ${fs}px 'Inter', system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle =
            isHovered || isFocused ? "#fff" : "rgba(255,255,255,0.85)";
          ctx.fillText(name, x, y + poleR + fs * 0.9 + 2);
        }
        return;
      }

      // ── COMPLETED NODE (crystalline hexagon + bloom) ─────────────
      if (completed) {
        const r = drawSize;
        const sides = 6;
        const phase = ((node.id as string) || "a").charCodeAt(0) * 0.7;
        const bloom = 0.5 + 0.5 * Math.sin(t * 0.7 + phase);

        // Bloom ring
        const bloomR = Math.max(1, r * (2.8 + bloom * 0.8));
        const bloomGrad = ctx.createRadialGradient(x, y, r * 0.5, x, y, bloomR);
        bloomGrad.addColorStop(0, `${color}20`);
        bloomGrad.addColorStop(0.5, `${color}06`);
        bloomGrad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, bloomR, 0, Math.PI * 2);
        ctx.fillStyle = bloomGrad;
        ctx.fill();

        // Hexagon body
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = (i * Math.PI * 2) / sides - Math.PI / 2;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        const crystalFill = ctx.createRadialGradient(
          x - r * 0.2,
          y - r * 0.2,
          0,
          x,
          y,
          Math.max(1, r),
        );
        crystalFill.addColorStop(0, "#ffffff");
        crystalFill.addColorStop(0.3, `${color}DD`);
        crystalFill.addColorStop(1, `${color}88`);
        ctx.fillStyle = crystalFill;
        ctx.fill();

        // Sparkle
        const sparkle = Math.sin(t * 2.5 + phase) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(x - r * 0.18, y - r * 0.18, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(sparkle * 0.55).toFixed(2)})`;
        ctx.fill();

        // Orbiting sparkle particles
        for (let k = 0; k < 2; k++) {
          const sa = t * 1.2 + phase + k * Math.PI;
          const sr = r * (1.3 + k * 0.3);
          ctx.beginPath();
          ctx.arc(
            x + Math.cos(sa) * sr,
            y + Math.sin(sa) * sr,
            0.8,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = `rgba(255,255,255,${(0.2 + bloom * 0.25).toFixed(2)})`;
          ctx.fill();
        }

        // Border
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = (i * Math.PI * 2) / sides - Math.PI / 2;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = isFocused ? "#fff" : `${color}55`;
        ctx.lineWidth = isFocused ? 2 : 0.8;
        ctx.stroke();

        // Checkmark
        const cs = r * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - cs, y + cs * 0.1);
        ctx.lineTo(x - cs * 0.15, y + cs * 0.7);
        ctx.lineTo(x + cs, y - cs * 0.4);
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";

        // Label
        if (baseSize >= 7 || isHovered || isFocused || globalScale > 1.5) {
          const fs = Math.max(3.5, baseSize * 0.5);
          ctx.font = `${isHovered || isFocused ? "600 " : ""}${fs}px 'Inter', system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle =
            isHovered || isFocused ? "#fff" : "rgba(255,255,255,0.65)";
          ctx.fillText(name.slice(0, 22), x, y + r + fs + 2);
        }
        return;
      }

      // ── REGULAR NODE (circle) ────────────────────────────────────
      if (isHovered || isFocused) {
        const glowR = Math.max(1, drawSize * 2.5);
        const hGlow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        hGlow.addColorStop(0, `${color}28`);
        hGlow.addColorStop(0.5, `${color}0C`);
        hGlow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = hGlow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, drawSize, 0, Math.PI * 2);
      const nFill = ctx.createRadialGradient(
        x - drawSize * 0.2,
        y - drawSize * 0.2,
        0,
        x,
        y,
        Math.max(1, drawSize),
      );
      nFill.addColorStop(0, `${color}CC`);
      nFill.addColorStop(1, `${color}77`);
      ctx.fillStyle = nFill;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, drawSize, 0, Math.PI * 2);
      ctx.strokeStyle = isFocused
        ? "#fff"
        : isHovered
          ? `${color}BB`
          : `${color}33`;
      ctx.lineWidth = isFocused ? 2 : isHovered ? 1.2 : 0.5;
      ctx.stroke();

      if (type === "loop") {
        ctx.beginPath();
        ctx.arc(x, y, drawSize * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}35`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      const showLabel =
        type === "loop" ||
        baseSize >= 8 ||
        isHovered ||
        isFocused ||
        globalScale > 2;
      if (showLabel && globalScale > 0.4) {
        const fs = Math.max(3.5, drawSize * 0.5);
        ctx.font = `${isHovered || isFocused ? "600 " : ""}${fs}px 'Inter', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle =
          isHovered || isFocused ? "#fff" : "rgba(255,255,255,0.55)";
        ctx.fillText(name.slice(0, 22), x, y + drawSize + fs * 0.8 + 2);
      }
    },
    [hoveredNode, focusedNode, activeWorld],
  );

  // ── Node click ─────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      const wn = node as unknown as WorldNode;
      if (wn.type === "world-region") return;
      setActiveWorld(wn.worldId);
      setFocusedNode({
        id: wn.id,
        name: wn.name,
        type: wn.type,
        metadata: {
          worldId: wn.worldId,
          completed: wn.completed,
          ...wn.metadata,
        },
      });
      if (fgRef.current) {
        fgRef.current.centerAt(node.x as number, node.y as number, 600);
        fgRef.current.zoom(wn.type === "pole" ? 2.5 : 3.5, 600);
      }
    },
    [setFocusedNode, setActiveWorld],
  );

  // ── Fly to world ───────────────────────────────────────────────────
  const flyToWorld = useCallback(
    (wid: WorldId) => {
      const w = WORLDS[wid];
      setActiveWorld(wid);
      if (fgRef.current && w) {
        fgRef.current.centerAt(w.position.x, w.position.y, 800);
        fgRef.current.zoom(2.5, 800);
      }
    },
    [setActiveWorld],
  );

  // ── Zoom controls ──────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    fgRef.current?.zoom(fgRef.current.zoom() * 1.5, 300);
  }, []);
  const handleZoomOut = useCallback(() => {
    fgRef.current?.zoom(fgRef.current.zoom() / 1.5, 300);
  }, []);
  const handleZoomFit = useCallback(() => {
    fgRef.current?.zoomToFit(400, 60);
  }, []);
  const toggleSearch = useCallback(() => {
    setShowSearch((p) => {
      if (!p) setTimeout(() => searchInputRef.current?.focus(), 100);
      return !p;
    });
  }, []);

  const nodeCount = filteredNodes.filter(
    (n) => n.type !== "world-region",
  ).length;
  const linkCount = filteredLinks.length;

  // ==================================================================
  // RENDER
  // ==================================================================
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-[#050510] overflow-hidden",
        className,
      )}
      style={{ cursor: hoveredNode ? "pointer" : "grab" }}
    >
      {/* Fractal mandala background */}
      <FractalPattern
        width={dimensions.width}
        height={dimensions.height}
        opacity={0.38}
        animated
        className="absolute inset-0 z-0"
      />

      {/* IORS focus vignette */}
      {iorsActivity !== "idle" && (
        <div
          className={cn(
            "iors-focus-active",
            iorsActivity === "thinking" && "iors-focus-thinking",
            iorsActivity === "building" && "iors-focus-building",
            iorsActivity === "researching" && "iors-focus-researching",
          )}
        />
      )}

      {/* Force graph — positioned above FractalPattern (z-0), below overlays */}
      <div className="absolute inset-0 z-[1]">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObject={paintNode}
            nodeCanvasObjectMode={() => "replace"}
            nodePointerAreaPaint={(
              node: Record<string, unknown>,
              color: string,
              ctx: CanvasRenderingContext2D,
            ) => {
              if ((node.type as string) === "world-region") return;
              const s = NODE_SIZES[(node.type as WorldNodeType) || "task"] || 5;
              ctx.beginPath();
              ctx.arc(
                node.x as number,
                node.y as number,
                s + 4,
                0,
                Math.PI * 2,
              );
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(l: Record<string, unknown>) => {
              switch (l.type as string) {
                case "influence":
                  return "rgba(168,85,247,0.14)";
                case "dependency":
                  return "rgba(6,182,212,0.14)";
                case "reference":
                  return "rgba(245,158,11,0.10)";
                default:
                  return "rgba(255,255,255,0.05)";
              }
            }}
            linkWidth={(l: Record<string, unknown>) =>
              (l.type as string) === "hierarchy" ? 1 : 0.5
            }
            linkCurvature={(l: Record<string, unknown>) => {
              switch (l.type as string) {
                case "influence":
                  return 0.2;
                case "dependency":
                  return 0.15;
                default:
                  return 0;
              }
            }}
            linkDirectionalParticles={(l: Record<string, unknown>) => {
              const t = l.type as string;
              return t === "influence" || t === "dependency" ? 3 : 1;
            }}
            linkDirectionalParticleWidth={1.6}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={(l: Record<string, unknown>) => {
              switch (l.type as string) {
                case "influence":
                  return "rgba(168,85,247,0.45)";
                case "dependency":
                  return "rgba(6,182,212,0.45)";
                default:
                  return "rgba(139,92,246,0.25)";
              }
            }}
            onNodeClick={handleNodeClick}
            onNodeHover={(n: Record<string, unknown> | null) => {
              if ((n?.type as string) === "world-region") {
                setHoveredNode(null);
                return;
              }
              setHoveredNode((n?.id as string) || null);
            }}
            warmupTicks={100}
            cooldownTime={8000}
            d3AlphaDecay={0.012}
            d3VelocityDecay={0.3}
            enableNodeDrag
            enableZoomInteraction
            enablePanInteraction
          />
        )}
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2.5 pointer-events-none">
        <div className="pointer-events-auto">
          {showSearch ? (
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 w-64 animate-in slide-in-from-left-2 fade-in duration-200">
              <Search className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
              <input
                ref={searchInputRef}
                value={graphFilter}
                onChange={(e) => setGraphFilter(e.target.value)}
                placeholder="Szukaj w światach..."
                className="flex-1 bg-transparent text-white text-xs placeholder:text-white/30 focus:outline-none"
              />
              {graphFilter && (
                <button
                  onClick={() => setGraphFilter("")}
                  className="p-0.5 rounded hover:bg-white/10"
                >
                  <X className="w-3 h-3 text-white/50" />
                </button>
              )}
              <button
                onClick={() => {
                  setShowSearch(false);
                  setGraphFilter("");
                }}
                className="p-0.5 rounded hover:bg-white/10"
              >
                <X className="w-3 h-3 text-white/40" />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleSearch}
              className="flex items-center gap-1.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-2.5 py-1.5 hover:bg-white/10 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[10px] text-white/40">Szukaj</span>
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-0.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-0.5">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Przybliż"
          >
            <ZoomIn className="w-3.5 h-3.5 text-white/60" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Oddal"
          >
            <ZoomOut className="w-3.5 h-3.5 text-white/60" />
          </button>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleZoomFit}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Dopasuj"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
      </div>

      {/* World legend */}
      <div className="absolute top-12 left-3 pointer-events-auto">
        <div className="flex flex-col gap-1 bg-white/[0.03] backdrop-blur-sm rounded-xl p-2 border border-white/[0.06]">
          <span className="text-[8px] text-white/25 uppercase tracking-wider px-1 mb-0.5">
            6 Światów TAU
          </span>
          {Object.values(WORLDS).map((w) => {
            const Icon = w.icon;
            const isActive = activeWorld === w.id;
            return (
              <button
                key={w.id}
                onClick={() => flyToWorld(w.id)}
                className={cn(
                  "flex items-center gap-1.5 px-1.5 py-1 rounded-lg transition-all text-left group/w",
                  isActive ? "bg-white/10" : "hover:bg-white/5",
                )}
                title={w.description}
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0 transition-shadow duration-300",
                    isActive && "world-glow",
                  )}
                  style={{
                    backgroundColor: w.color,
                    ...(isActive
                      ? ({
                          "--world-glow-color": `${w.color}66`,
                        } as React.CSSProperties)
                      : {}),
                  }}
                />
                <Icon
                  className={cn(
                    "w-3 h-3 flex-shrink-0",
                    isActive ? "text-white/70" : "text-white/25",
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] truncate max-w-[90px]",
                    isActive
                      ? "text-white/85 font-medium"
                      : "text-white/35 group-hover/w:text-white/55",
                  )}
                >
                  {w.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Axis labels */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="text-[7px] text-white/12 tracking-widest uppercase">
          ↑ Analogowe · Ja
        </span>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="text-[7px] text-white/12 tracking-widest uppercase">
          ↓ Cyfrowe · IORS
        </span>
      </div>
      <div
        className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        <span className="text-[7px] text-white/12 tracking-widest uppercase">
          ← Znane
        </span>
      </div>
      <div
        className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        <span className="text-[7px] text-white/12 tracking-widest uppercase">
          Nieznane →
        </span>
      </div>

      {/* Bottom stats */}
      <div className="absolute bottom-2 right-3 pointer-events-none flex flex-col items-end gap-0.5">
        <span className="text-[9px] text-white/18">
          {nodeCount} węzłów · {linkCount} połączeń
        </span>
        <span className="text-[7px] text-white/10">
          TAU · Znane ↔ Nieznane · Ja ↔ IORS
        </span>
      </div>

      {/* Focused node panel */}
      {focusedNode && focusedNode.type !== "world-region" && (
        <FocusedNodePanel
          focusedNode={focusedNode}
          rawNodes={rawNodes}
          onClose={() => setFocusedNode(null)}
          onChat={(n) => onChatAboutNode?.(n)}
          onFlyToWorld={flyToWorld}
        />
      )}
    </div>
  );
}

// ===========================================================================
// FOCUSED NODE PANEL
// ===========================================================================

function FocusedNodePanel({
  focusedNode,
  rawNodes,
  onClose,
  onChat,
  onFlyToWorld,
}: {
  focusedNode: FocusedNode;
  rawNodes: WorldNode[];
  onClose: () => void;
  onChat: (n: WorldNode) => void;
  onFlyToWorld: (w: WorldId) => void;
}) {
  const worldId = focusedNode.metadata?.worldId as WorldId | undefined;
  const world = worldId ? WORLDS[worldId] : undefined;
  const isCompleted = focusedNode.metadata?.completed as boolean | undefined;

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100%-2rem)] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto z-20">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: world?.color || "#6B7280" }}
            />
            <h3 className="text-sm font-semibold text-white truncate">
              {focusedNode.name}
            </h3>
            <span className="text-[10px] text-white/30 capitalize flex-shrink-0">
              {focusedNode.type}
            </span>
            {isCompleted && (
              <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                ✓
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
        {world && (
          <div className="mb-3 text-[10px] text-white/30">
            Świat:{" "}
            <span style={{ color: `${world.color}AA` }}>{world.name}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              const n = rawNodes.find((x) => x.id === focusedNode.id);
              if (n) onChat(n);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 text-xs font-medium transition-colors"
          >
            <MessageCircle className="w-3 h-3" />
            Porozmawiaj
          </button>
          {worldId && (
            <button
              onClick={() => onFlyToWorld(worldId)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/55 text-xs font-medium transition-colors"
            >
              <Layers className="w-3 h-3" />
              Cały świat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
