/**
 * TreeGraph — Full-screen interactive tree/graph visualization
 *
 * The "other half" of the dual interface. When active, this is the primary view.
 * Uses react-force-graph-2d for an immersive, zoomable graph of the user's
 * entire system: values, goals, tasks, knowledge, health, relationships.
 *
 * Nodes represent "poles" (bieguny) — core life domains.
 * Branches are sub-categories, leaves are individual items.
 *
 * Features:
 * - Click node → shows details in a floating panel (or triggers chat context)
 * - Double-click → zooms into that subtree
 * - Right-click → context menu (edit, delete, chat about this)
 * - Search/filter bar at top
 * - Depth selector
 * - Node actions flow through chat (typing "/node:health" etc.)
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
  type FocusedNode,
} from "@/lib/stores/useInterfaceStore";
import { cn } from "@/lib/utils";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  X,
  MessageCircle,
  ChevronRight,
  Layers,
} from "lucide-react";

// Dynamic import for force-graph (no SSR)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">
          Ładowanie grafu...
        </span>
      </div>
    </div>
  ),
});

// ===========================================================================
// TYPES
// ===========================================================================

export interface TreeNode {
  id: string;
  name: string;
  type:
    | "pole" // Core life domain (top level)
    | "branch" // Sub-category
    | "leaf" // Individual item (task, goal, note)
    | "value" // Value/belief
    | "goal" // Goal
    | "task" // Task
    | "skill" // Skill/mod
    | "knowledge" // Knowledge entry
    | "person" // Person/relationship
    | "health" // Health metric
    | "system"; // System node
  color?: string;
  size?: number;
  parent?: string;
  metadata?: Record<string, unknown>;
}

export interface TreeLink {
  source: string;
  target: string;
  type?: "hierarchy" | "reference" | "dependency" | "influence";
  strength?: number;
}

interface TreeGraphProps {
  /** Custom nodes — if not provided, uses demo data */
  nodes?: TreeNode[];
  /** Custom links */
  links?: TreeLink[];
  /** Callback when user wants to chat about a node */
  onChatAboutNode?: (node: TreeNode) => void;
}

// ===========================================================================
// COLORS & SIZES
// ===========================================================================

const NODE_COLORS: Record<string, string> = {
  pole: "#8B5CF6",
  branch: "#3B82F6",
  leaf: "#6B7280",
  value: "#EC4899",
  goal: "#10B981",
  task: "#F59E0B",
  skill: "#14B8A6",
  knowledge: "#6366F1",
  person: "#F97316",
  health: "#22C55E",
  system: "#64748B",
};

const NODE_SIZES: Record<string, number> = {
  pole: 16,
  branch: 10,
  leaf: 5,
  value: 12,
  goal: 10,
  task: 7,
  skill: 8,
  knowledge: 7,
  person: 9,
  health: 9,
  system: 6,
};

// ===========================================================================
// DEMO DATA
// ===========================================================================

const DEMO_NODES: TreeNode[] = [
  // Poles (bieguny)
  { id: "health", name: "Zdrowie", type: "pole", color: "#22C55E" },
  { id: "mind", name: "Umysł", type: "pole", color: "#8B5CF6" },
  { id: "work", name: "Praca", type: "pole", color: "#3B82F6" },
  { id: "relations", name: "Relacje", type: "pole", color: "#F59E0B" },
  { id: "growth", name: "Rozwój", type: "pole", color: "#EC4899" },
  { id: "finance", name: "Finanse", type: "pole", color: "#14B8A6" },

  // Health branches
  { id: "sleep", name: "Sen", type: "health", parent: "health" },
  { id: "exercise", name: "Aktywność", type: "health", parent: "health" },
  { id: "nutrition", name: "Odżywianie", type: "health", parent: "health" },
  { id: "energy", name: "Energia", type: "health", parent: "health" },

  // Mind branches
  { id: "focus", name: "Focus", type: "branch", parent: "mind" },
  { id: "emotions", name: "Emocje", type: "branch", parent: "mind" },
  { id: "creativity", name: "Kreatywność", type: "branch", parent: "mind" },
  { id: "meditation", name: "Medytacja", type: "branch", parent: "mind" },

  // Work branches
  { id: "projects", name: "Projekty", type: "branch", parent: "work" },
  { id: "meetings", name: "Spotkania", type: "branch", parent: "work" },
  { id: "tasks-node", name: "Zadania", type: "task", parent: "work" },
  { id: "deadlines", name: "Deadline'y", type: "branch", parent: "work" },

  // Relations branches
  { id: "family", name: "Rodzina", type: "person", parent: "relations" },
  { id: "friends", name: "Przyjaciele", type: "person", parent: "relations" },
  { id: "partner", name: "Partner/ka", type: "person", parent: "relations" },
  { id: "network", name: "Sieć", type: "person", parent: "relations" },

  // Growth branches
  { id: "skills-node", name: "Umiejętności", type: "skill", parent: "growth" },
  { id: "learning", name: "Nauka", type: "knowledge", parent: "growth" },
  { id: "goals-node", name: "Cele", type: "goal", parent: "growth" },
  { id: "habits", name: "Nawyki", type: "branch", parent: "growth" },

  // Finance branches
  { id: "income", name: "Przychody", type: "branch", parent: "finance" },
  { id: "expenses", name: "Wydatki", type: "branch", parent: "finance" },
  { id: "investments", name: "Inwestycje", type: "branch", parent: "finance" },
  { id: "savings", name: "Oszczędności", type: "branch", parent: "finance" },

  // Cross-connections (leaf examples)
  { id: "sleep-goal", name: "8h snu", type: "goal", parent: "sleep" },
  {
    id: "run-habit",
    name: "Bieganie 3x/tyg",
    type: "task",
    parent: "exercise",
  },
  {
    id: "read-habit",
    name: "Czytanie 30min",
    type: "task",
    parent: "learning",
  },
];

const DEMO_LINKS: TreeLink[] = [
  // Hierarchy links (parent-child)
  ...DEMO_NODES.filter((n) => n.parent).map((n) => ({
    source: n.parent!,
    target: n.id,
    type: "hierarchy" as const,
    strength: 0.8,
  })),
  // Cross-pole influences
  { source: "sleep", target: "energy", type: "influence", strength: 0.5 },
  { source: "energy", target: "focus", type: "influence", strength: 0.4 },
  { source: "focus", target: "projects", type: "influence", strength: 0.3 },
  {
    source: "meditation",
    target: "emotions",
    type: "influence",
    strength: 0.4,
  },
  { source: "exercise", target: "energy", type: "influence", strength: 0.5 },
  {
    source: "learning",
    target: "skills-node",
    type: "dependency",
    strength: 0.4,
  },
  { source: "income", target: "investments", type: "reference", strength: 0.3 },
];

// ===========================================================================
// COMPONENT
// ===========================================================================

export function TreeGraph({
  nodes: customNodes,
  links: customLinks,
  onChatAboutNode,
}: TreeGraphProps) {
  const {
    focusedNode,
    setFocusedNode,
    graphFilter,
    setGraphFilter,
    expandStream,
  } = useInterfaceStore();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Use custom or demo data
  const rawNodes = customNodes || DEMO_NODES;
  const rawLinks = customLinks || DEMO_LINKS;

  // Filter nodes based on search
  const { filteredNodes, filteredLinks } = useMemo(() => {
    if (!graphFilter.trim()) {
      return { filteredNodes: rawNodes, filteredLinks: rawLinks };
    }

    const query = graphFilter.toLowerCase();
    const matchingIds = new Set<string>();

    // Find matching nodes
    for (const node of rawNodes) {
      if (
        node.name.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query)
      ) {
        matchingIds.add(node.id);
        // Also include parent chain
        let current = rawNodes.find((n) => n.id === node.parent);
        while (current) {
          matchingIds.add(current.id);
          current = rawNodes.find((n) => n.id === current!.parent);
        }
      }
    }

    const filteredNodes = rawNodes.filter((n) => matchingIds.has(n.id));
    const filteredLinks = rawLinks.filter(
      (l) => matchingIds.has(l.source) && matchingIds.has(l.target),
    );

    return { filteredNodes, filteredLinks };
  }, [rawNodes, rawLinks, graphFilter]);

  // Build graph data for force-graph
  const graphData = useMemo(
    () => ({
      nodes: filteredNodes.map((n) => ({
        ...n,
        color: n.color || NODE_COLORS[n.type] || "#6B7280",
        val: n.size || NODE_SIZES[n.type] || 5,
      })),
      links: filteredLinks.map((l) => ({
        ...l,
        color:
          l.type === "hierarchy"
            ? "rgba(255,255,255,0.12)"
            : l.type === "influence"
              ? "rgba(139,92,246,0.2)"
              : "rgba(100,100,100,0.1)",
      })),
    }),
    [filteredNodes, filteredLinks],
  );

  // Node click handler
  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      const treeNode = node as unknown as TreeNode;
      setFocusedNode({
        id: treeNode.id,
        name: treeNode.name,
        type: treeNode.type,
        metadata: treeNode.metadata,
      });

      // Zoom to node
      if (fgRef.current) {
        fgRef.current.centerAt(node.x as number, node.y as number, 500);
        fgRef.current.zoom(3, 500);
      }
    },
    [setFocusedNode],
  );

  // Double click → zoom deeper
  const handleNodeDoubleClick = useCallback((node: Record<string, unknown>) => {
    if (fgRef.current) {
      fgRef.current.centerAt(node.x as number, node.y as number, 500);
      fgRef.current.zoom(5, 500);
    }
  }, []);

  // Custom node painting
  const paintNode = useCallback(
    (node: Record<string, unknown>, ctx: CanvasRenderingContext2D) => {
      const x = node.x as number;
      const y = node.y as number;
      const size = (node.val as number) || 5;
      const color = (node.color as string) || "#6B7280";
      const name = (node.name as string) || "";
      const type = (node.type as string) || "leaf";
      const isHovered = node.id === hoveredNode;
      const isFocused = focusedNode?.id === node.id;
      const isPole = type === "pole";

      // Outer glow for poles
      if (isPole || isHovered || isFocused) {
        const glowSize = isPole ? size * 3 : size * 2;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
        gradient.addColorStop(0, `${color}30`);
        gradient.addColorStop(0.5, `${color}10`);
        gradient.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, glowSize, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Inner highlight
      if (isPole) {
        ctx.beginPath();
        ctx.arc(x - size * 0.2, y - size * 0.2, size * 0.4, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();
      }

      // Border
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.strokeStyle = isFocused
        ? "#fff"
        : isHovered
          ? `${color}CC`
          : `${color}40`;
      ctx.lineWidth = isFocused ? 2.5 : isHovered ? 1.5 : 0.5;
      ctx.stroke();

      // Label
      const showLabel = isPole || size >= 8 || isHovered || isFocused;
      if (showLabel) {
        const fontSize = isPole
          ? Math.max(5, size * 0.6)
          : Math.max(3, size * 0.5);
        ctx.font = `${isHovered || isFocused ? "bold " : ""}${fontSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle =
          isHovered || isFocused ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.fillText(name.slice(0, 25), x, y + size + fontSize * 0.8 + 2);
      }
    },
    [hoveredNode, focusedNode],
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (fgRef.current) fgRef.current.zoom(fgRef.current.zoom() * 1.5, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (fgRef.current) fgRef.current.zoom(fgRef.current.zoom() / 1.5, 300);
  }, []);

  const handleZoomFit = useCallback(() => {
    if (fgRef.current) fgRef.current.zoomToFit(400, 50);
  }, []);

  // Toggle search
  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 100);
      return !prev;
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background overflow-hidden"
    >
      {/* Force graph */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="hsl(var(--bg-void, 240 60% 3%))"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(
          node: Record<string, unknown>,
          color: string,
          ctx: CanvasRenderingContext2D,
        ) => {
          const size = (node.val as number) || 5;
          ctx.beginPath();
          ctx.arc(node.x as number, node.y as number, size + 3, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(link: Record<string, unknown>) =>
          (link.color as string) || "rgba(100,100,100,0.1)"
        }
        linkWidth={(link: Record<string, unknown>) =>
          (link.type as string) === "hierarchy" ? 1 : 0.5
        }
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.003}
        linkDirectionalParticleColor={() => "rgba(139,92,246,0.6)"}
        onNodeClick={handleNodeClick}
        onNodeHover={(node: Record<string, unknown> | null) =>
          setHoveredNode((node?.id as string) || null)
        }
        warmupTicks={80}
        cooldownTime={5000}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.25}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />

      {/* Top bar: search & controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        {/* Search bar */}
        <div className="pointer-events-auto">
          {showSearch ? (
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 w-72 animate-in slide-in-from-left-2 fade-in duration-200">
              <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
              <input
                ref={searchInputRef}
                value={graphFilter}
                onChange={(e) => setGraphFilter(e.target.value)}
                placeholder="Szukaj w drzewie..."
                className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
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
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleSearch}
              className="flex items-center gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 hover:bg-white/10 transition-colors"
            >
              <Search className="w-4 h-4 text-white/50" />
              <span className="text-xs text-white/40">Szukaj</span>
            </button>
          )}
        </div>

        {/* Zoom controls */}
        <div className="pointer-events-auto flex items-center gap-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Przybliż"
          >
            <ZoomIn className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Oddal"
          >
            <ZoomOut className="w-4 h-4 text-white/60" />
          </button>
          <div className="w-px h-5 bg-white/10" />
          <button
            onClick={handleZoomFit}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Dopasuj"
          >
            <Maximize2 className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Node count */}
      <div className="absolute bottom-3 right-3 text-[10px] text-white/20 pointer-events-none">
        {filteredNodes.length} węzłów · {filteredLinks.length} połączeń
      </div>

      {/* Focused node panel */}
      {focusedNode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-80 animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: NODE_COLORS[focusedNode.type] || "#6B7280",
                  }}
                />
                <h3 className="text-sm font-semibold text-white">
                  {focusedNode.name}
                </h3>
                <span className="text-[10px] text-white/30 capitalize">
                  {focusedNode.type}
                </span>
              </div>
              <button
                onClick={() => setFocusedNode(null)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const node = rawNodes.find((n) => n.id === focusedNode.id);
                  if (node && onChatAboutNode) {
                    onChatAboutNode(node);
                    expandStream();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium transition-colors"
              >
                <MessageCircle className="w-3 h-3" />
                Porozmawiaj
              </button>
              <button
                onClick={() => {
                  // Zoom into children
                  if (fgRef.current) {
                    fgRef.current.zoom(5, 500);
                  }
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-medium transition-colors"
              >
                <Layers className="w-3 h-3" />
                Wejdź głębiej
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-14 left-4 pointer-events-none">
        <div className="flex flex-col gap-1">
          {Object.entries(NODE_COLORS)
            .slice(0, 6)
            .map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[9px] text-white/25 capitalize">
                  {type}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
