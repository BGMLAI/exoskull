/**
 * GraphMiniature — Miniature graph/tree visualization in the corner
 *
 * Displayed in Chat mode as a small interactive preview of the system tree.
 * Clicking it switches to full Graph mode.
 * Hovering expands it slightly for a better preview.
 *
 * Shows the "poles" (bieguny) of the system: core value nodes with connections.
 */
"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
} from "react";
import { useInterfaceStore } from "@/lib/stores/useInterfaceStore";
import { cn } from "@/lib/utils";
import { Maximize2, Network } from "lucide-react";

// Node types for the miniature poles visualization
interface MiniNode {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  type: "pole" | "branch" | "leaf";
  pulseDelay: number;
}

interface MiniLink {
  from: string;
  to: string;
  opacity: number;
}

// Demo poles data — will be replaced by real data from API
const DEMO_POLES: MiniNode[] = [
  {
    id: "health",
    label: "Zdrowie",
    x: 35,
    y: 25,
    radius: 8,
    color: "#10B981",
    type: "pole",
    pulseDelay: 0,
  },
  {
    id: "mind",
    label: "Umysł",
    x: 65,
    y: 20,
    radius: 8,
    color: "#8B5CF6",
    type: "pole",
    pulseDelay: 0.5,
  },
  {
    id: "work",
    label: "Praca",
    x: 75,
    y: 55,
    radius: 7,
    color: "#3B82F6",
    type: "pole",
    pulseDelay: 1,
  },
  {
    id: "relations",
    label: "Relacje",
    x: 25,
    y: 60,
    radius: 7,
    color: "#F59E0B",
    type: "pole",
    pulseDelay: 1.5,
  },
  {
    id: "growth",
    label: "Rozwój",
    x: 50,
    y: 80,
    radius: 6,
    color: "#EC4899",
    type: "pole",
    pulseDelay: 2,
  },
  // Branches
  {
    id: "sleep",
    label: "Sen",
    x: 20,
    y: 35,
    radius: 4,
    color: "#10B981",
    type: "branch",
    pulseDelay: 0.3,
  },
  {
    id: "focus",
    label: "Focus",
    x: 55,
    y: 35,
    radius: 4,
    color: "#8B5CF6",
    type: "branch",
    pulseDelay: 0.8,
  },
  {
    id: "tasks",
    label: "Zadania",
    x: 85,
    y: 40,
    radius: 4,
    color: "#3B82F6",
    type: "branch",
    pulseDelay: 1.3,
  },
  {
    id: "family",
    label: "Rodzina",
    x: 15,
    y: 75,
    radius: 4,
    color: "#F59E0B",
    type: "branch",
    pulseDelay: 1.8,
  },
  {
    id: "skills",
    label: "Skills",
    x: 60,
    y: 70,
    radius: 4,
    color: "#EC4899",
    type: "branch",
    pulseDelay: 2.3,
  },
];

const DEMO_LINKS: MiniLink[] = [
  { from: "health", to: "sleep", opacity: 0.6 },
  { from: "health", to: "mind", opacity: 0.3 },
  { from: "mind", to: "focus", opacity: 0.6 },
  { from: "mind", to: "work", opacity: 0.3 },
  { from: "work", to: "tasks", opacity: 0.6 },
  { from: "relations", to: "family", opacity: 0.6 },
  { from: "relations", to: "health", opacity: 0.2 },
  { from: "growth", to: "skills", opacity: 0.6 },
  { from: "growth", to: "mind", opacity: 0.3 },
  { from: "growth", to: "work", opacity: 0.2 },
];

export function GraphMiniature() {
  const { setMode, graphMiniatureExpanded, setGraphMiniatureExpanded } =
    useInterfaceStore();
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    setMode("graph");
  }, [setMode]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setGraphMiniatureExpanded(true);
  }, [setGraphMiniatureExpanded]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setGraphMiniatureExpanded(false);
  }, [setGraphMiniatureExpanded]);

  // Map node IDs to positions for link drawing
  const nodeMap = useMemo(() => {
    const map = new Map<string, MiniNode>();
    for (const node of DEMO_POLES) {
      map.set(node.id, node);
    }
    return map;
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "fixed z-50 cursor-pointer select-none",
        "transition-all duration-500 ease-out-expo",
        // Position: bottom-right corner
        "bottom-6 right-6",
        // Size: small by default, larger on hover
        isHovered ? "w-72 h-72" : "w-40 h-40",
        // Styling
        "rounded-2xl overflow-hidden",
        "bg-[#0a0a1a]/90 backdrop-blur-xl",
        "border border-white/10",
        "shadow-2xl shadow-black/40",
        // Hover glow
        isHovered && "border-primary/30 shadow-primary/10",
      )}
    >
      {/* SVG graph */}
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Links */}
        {DEMO_LINKS.map((link, i) => {
          const from = nodeMap.get(link.from);
          const to = nodeMap.get(link.to);
          if (!from || !to) return null;
          return (
            <line
              key={`l-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="white"
              strokeWidth="0.3"
              opacity={link.opacity * 0.4}
            >
              <animate
                attributeName="opacity"
                values={`${link.opacity * 0.15};${link.opacity * 0.5};${link.opacity * 0.15}`}
                dur={`${3 + i * 0.4}s`}
                repeatCount="indefinite"
              />
            </line>
          );
        })}

        {/* Nodes */}
        {DEMO_POLES.map((node) => (
          <g key={node.id}>
            {/* Glow */}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius * 2.5}
              fill={node.color}
              opacity={0}
            >
              <animate
                attributeName="opacity"
                values="0;0.15;0"
                dur={`${3 + node.pulseDelay}s`}
                begin={`${node.pulseDelay}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Core */}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={node.color}
              opacity={node.type === "pole" ? 0.9 : 0.5}
            >
              <animate
                attributeName="r"
                values={`${node.radius * 0.85};${node.radius * 1.15};${node.radius * 0.85}`}
                dur={`${2.5 + node.pulseDelay * 0.3}s`}
                begin={`${node.pulseDelay}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Label (only on hover / expanded) */}
            {isHovered && node.type === "pole" && (
              <text
                x={node.x}
                y={node.y + node.radius + 5}
                textAnchor="middle"
                className="fill-white/70"
                fontSize="3.5"
                fontWeight="500"
              >
                {node.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Expand hint overlay */}
      <div
        className={cn(
          "absolute inset-0 flex items-end justify-center pb-2",
          "transition-opacity duration-300",
          isHovered ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm">
          <Maximize2 className="w-3 h-3 text-white/70" />
          <span className="text-[10px] text-white/70 font-medium">
            Otwórz drzewo
          </span>
        </div>
      </div>

      {/* Subtle icon when not hovered */}
      {!isHovered && (
        <div className="absolute top-2 left-2">
          <Network className="w-3 h-3 text-white/30" />
        </div>
      )}
    </div>
  );
}
