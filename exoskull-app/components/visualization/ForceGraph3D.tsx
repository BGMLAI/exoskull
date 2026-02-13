/**
 * ForceGraph3D — 3D force-directed graph visualization
 *
 * Uses react-force-graph-3d (WebGL/three.js) for immersive
 * visualization of value hierarchy, knowledge graph, etc.
 *
 * Features:
 * - 3D rotate, zoom, pan
 * - Color-coded nodes by type
 * - Click-to-expand
 * - Neural network aesthetic
 *
 * Note: Requires `react-force-graph-3d` package.
 * Falls back to 2D if 3D not available.
 */
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with three.js
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
      Ladowanie wizualizacji...
    </div>
  ),
});

// ============================================================================
// TYPES
// ============================================================================

export interface GraphNode {
  id: string;
  name: string;
  type:
    | "value"
    | "area"
    | "quest"
    | "campaign"
    | "mission"
    | "challenge"
    | "note"
    | "entity"
    | "concept";
  color?: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphLink {
  source: string;
  target: string;
  type?: string;
  strength?: number;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  height?: number;
  width?: number;
  onNodeClick?: (node: GraphNode) => void;
  /** Display mode */
  mode?: "2d" | "3d";
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

const NODE_COLORS: Record<string, string> = {
  value: "#8B5CF6", // Purple
  area: "#3B82F6", // Blue
  quest: "#10B981", // Green
  campaign: "#F59E0B", // Amber
  mission: "#EF4444", // Red
  challenge: "#EC4899", // Pink
  note: "#6B7280", // Gray
  entity: "#14B8A6", // Teal
  concept: "#8B5CF6", // Purple (same as value)
};

const NODE_SIZES: Record<string, number> = {
  value: 12,
  area: 8,
  quest: 6,
  campaign: 5,
  mission: 4,
  challenge: 3,
  note: 2,
  entity: 5,
  concept: 5,
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ForceGraphVisualization({
  nodes,
  links,
  height = 500,
  width,
  onNodeClick,
}: ForceGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(undefined);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({
        ...n,
        color: n.color || NODE_COLORS[n.type] || "#6B7280",
        val: n.size || NODE_SIZES[n.type] || 4,
      })),
      links: links.map((l) => ({
        ...l,
        color: `rgba(100, 100, 100, ${l.strength || 0.3})`,
      })),
    }),
    [nodes, links],
  );

  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      if (onNodeClick) {
        onNodeClick(node as unknown as GraphNode);
      }
    },
    [onNodeClick],
  );

  const paintNode = useCallback(
    (node: Record<string, unknown>, ctx: CanvasRenderingContext2D) => {
      const x = node.x as number;
      const y = node.y as number;
      const size = (node.val as number) || 4;
      const color = (node.color as string) || "#6B7280";
      const isHovered = node.id === hoveredNode;

      // Glow effect
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(x, y, size * 2, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
        gradient.addColorStop(0, `${color}40`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.strokeStyle = isHovered ? "#fff" : `${color}80`;
      ctx.lineWidth = isHovered ? 2 : 0.5;
      ctx.stroke();

      // Label (only for larger nodes or hovered)
      const name = node.name as string;
      if (size >= 5 || isHovered) {
        ctx.font = `${isHovered ? "bold " : ""}${Math.max(3, size * 0.8)}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isHovered ? "#fff" : "#94a3b8";
        ctx.fillText(name?.slice(0, 20) || "", x, y + size + 6);
      }
    },
    [hoveredNode],
  );

  return (
    <div className="relative rounded-lg overflow-hidden bg-[#0a0a1a] border border-border/30">
      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
        {Object.entries(NODE_COLORS)
          .slice(0, 6)
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] text-gray-400 capitalize">
                {type}
              </span>
            </div>
          ))}
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="#0a0a1a"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(
          node: Record<string, unknown>,
          color: string,
          ctx: CanvasRenderingContext2D,
        ) => {
          const size = (node.val as number) || 4;
          ctx.beginPath();
          ctx.arc(node.x as number, node.y as number, size + 2, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(link: Record<string, unknown>) =>
          (link.color as string) || "rgba(100,100,100,0.2)"
        }
        linkWidth={0.5}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1}
        linkDirectionalParticleSpeed={0.005}
        onNodeClick={handleNodeClick}
        onNodeHover={(node: Record<string, unknown> | null) =>
          setHoveredNode((node?.id as string) || null)
        }
        warmupTicks={50}
        cooldownTime={3000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />

      {/* Node count badge */}
      <div className="absolute bottom-2 right-2 text-[10px] text-gray-500">
        {nodes.length} nodes · {links.length} connections
      </div>
    </div>
  );
}
