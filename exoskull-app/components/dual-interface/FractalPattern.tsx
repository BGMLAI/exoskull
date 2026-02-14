/**
 * FractalPattern — Organic fractal visualization of completed goals
 *
 * Each completed quest/op/task crystallizes into a permanent shape element.
 * Together, completed items form a growing mandala pattern — like a flower
 * blooming or crystal structure expanding outward from the center.
 *
 * Layout uses phyllotaxis (sunflower) spiral — the golden angle ensures
 * each new element fills space optimally, creating a natural organic look.
 *
 * Each of the 6 TAU worlds has its own shape and color:
 *   Health (emerald)      → Leaf
 *   Work (blue)           → Diamond
 *   Relationships (rose)  → Petal
 *   Finance (amber)       → Hexagon
 *   Growth (violet)       → Star
 *   Creativity (cyan)     → Spiral petal
 *
 * Used as a background layer in WorldsGraph behind completed nodes,
 * or standalone as an achievement visualization.
 */
"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

/** World colors matching the TAU 6-world system */
const WORLD_COLORS: Record<string, string> = {
  health: "#10B981",
  work: "#3B82F6",
  relationships: "#EC4899",
  finance: "#F59E0B",
  growth: "#8B5CF6",
  creativity: "#06B6D4",
  fun: "#22D3EE",
  default: "#6B7280",
};

/** Shape archetype per world */
type ShapeType = "leaf" | "diamond" | "petal" | "hexagon" | "star" | "spiral";

const WORLD_SHAPES: Record<string, ShapeType> = {
  health: "leaf",
  work: "diamond",
  relationships: "petal",
  finance: "hexagon",
  growth: "star",
  creativity: "spiral",
};

/** A completed item that crystallizes into a fractal element */
export interface FractalItem {
  id: string;
  /** Type determines base size (campaign > quest > op > task) */
  type: "quest" | "op" | "task" | "campaign";
  /** Loop slug — maps to color and shape */
  world: string;
  /** ISO date string — determines position in growth order */
  completedAt?: string;
  /** 1-10 scale — affects element size and brightness */
  importance?: number;
}

interface FractalPatternProps {
  /** Completed items forming the fractal. If empty/undefined, shows demo. */
  items?: FractalItem[];
  /** SVG viewBox width (default: 200) */
  width?: number;
  /** SVG viewBox height (default: 200) */
  height?: number;
  /** Overall pattern opacity (default: 0.55) */
  opacity?: number;
  /** Enable pulse/glow SVG animations (default: true) */
  animated?: boolean;
  /** Additional CSS classes on the wrapper */
  className?: string;
}

// ============================================================================
// MATH UTILITIES
// ============================================================================

/** Golden angle ≈ 137.508° — produces phyllotaxis (sunflower) spiral */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Deterministic PRNG for consistent fractal layout across renders */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to 1 decimal for cleaner SVG output */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ============================================================================
// SVG SHAPE GENERATORS
// ============================================================================

/** Teardrop / leaf — organic, flowing */
function leafPath(s: number): string {
  const h = s * 1.4;
  const w = s * 0.6;
  return [
    `M0 ${r1(-h / 2)}`,
    `C${r1(w)} ${r1(-h / 4)} ${r1(w)} ${r1(h / 4)} 0 ${r1(h / 2)}`,
    `C${r1(-w)} ${r1(h / 4)} ${r1(-w)} ${r1(-h / 4)} 0 ${r1(-h / 2)}Z`,
  ].join(" ");
}

/** Diamond / rhombus — sharp, geometric */
function diamondPath(s: number): string {
  const v = r1(s * 0.7);
  const h = r1(s * 0.5);
  return `M0 ${-v} L${h} 0 L0 ${v} L${-h} 0Z`;
}

/** Rounded petal — soft, heart-like curves */
function petalPath(s: number): string {
  return [
    `M0 ${r1(-s)}`,
    `C${r1(s * 0.8)} ${r1(-s)} ${r1(s)} ${r1(-s * 0.2)} ${r1(s * 0.5)} ${r1(s * 0.3)}`,
    `L0 ${r1(s)}`,
    `L${r1(-s * 0.5)} ${r1(s * 0.3)}`,
    `C${r1(-s)} ${r1(-s * 0.2)} ${r1(-s * 0.8)} ${r1(-s)} 0 ${r1(-s)}Z`,
  ].join(" ");
}

/** Regular hexagon — structured, stable */
function hexagonPath(s: number): string {
  const rad = s * 0.6;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${r1(rad * Math.cos(a))} ${r1(rad * Math.sin(a))}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(" L")}Z`;
}

/** Six-pointed star — radiant, energetic */
function starPath(s: number): string {
  const outer = s * 0.7;
  const inner = s * 0.3;
  const pts = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    return `${r1(rad * Math.cos(a))} ${r1(rad * Math.sin(a))}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(" L")}Z`;
}

/** Curved spiral petal — creative, flowing */
function spiralPath(s: number): string {
  return [
    "M0 0",
    `C${r1(s * 0.3)} ${r1(-s * 0.8)} ${r1(s)} ${r1(-s * 0.5)} ${r1(s * 0.8)} 0`,
    `C${r1(s * 0.6)} ${r1(s * 0.4)} ${r1(s * 0.2)} ${r1(s * 0.5)} 0 0Z`,
  ].join(" ");
}

const SHAPE_GENERATORS: Record<ShapeType, (s: number) => string> = {
  leaf: leafPath,
  diamond: diamondPath,
  petal: petalPath,
  hexagon: hexagonPath,
  star: starPath,
  spiral: spiralPath,
};

function getShapePath(shape: ShapeType, size: number): string {
  return SHAPE_GENERATORS[shape](size);
}

// ============================================================================
// LAYOUT ENGINE
// ============================================================================

interface PlacedElement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  color: string;
  pathData: string;
  opacity: number;
  animDelay: number;
  ring: number;
}

interface PlacedConnection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
}

/**
 * Place items in a phyllotaxis spiral, creating organic growth from center.
 * Returns positioned elements + web-like connections between neighbors.
 */
function generateLayout(
  items: FractalItem[],
  cx: number,
  cy: number,
): { elements: PlacedElement[]; connections: PlacedConnection[] } {
  if (items.length === 0) return { elements: [], connections: [] };

  const rng = mulberry32(42);
  const elements: PlacedElement[] = [];
  const connections: PlacedConnection[] = [];

  // Sort by completedAt → first completed = closest to center
  const sorted = [...items].sort((a, b) => {
    if (a.completedAt && b.completedAt)
      return a.completedAt.localeCompare(b.completedAt);
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return 0;
  });

  // Adaptive spacing: tighter for many items, looser for few
  const spacing = Math.max(7, Math.min(13, 100 / Math.sqrt(sorted.length + 1)));

  // Size multiplier by item type (more significant = larger crystal)
  const TYPE_SCALE: Record<string, number> = {
    campaign: 1.3,
    quest: 1.1,
    op: 0.9,
    task: 0.75,
  };

  sorted.forEach((item, i) => {
    // Phyllotaxis spiral: angle increments by golden angle, radius by sqrt
    const angle = i * GOLDEN_ANGLE;
    const radius = Math.sqrt(i + 0.5) * spacing;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    const color = WORLD_COLORS[item.world] || WORLD_COLORS.default;
    const importance = item.importance ?? 5;

    // Size = base + importance bonus, scaled by type
    const size = (4 + (importance / 10) * 4) * (TYPE_SCALE[item.type] ?? 1);

    const shape = WORLD_SHAPES[item.world] || "diamond";
    const pathData = getShapePath(shape, size);

    // Rotation: radiate outward from center + subtle jitter
    const rotDeg = (angle * 180) / Math.PI + (rng() - 0.5) * 15;
    const ring = Math.floor(Math.sqrt(i));

    elements.push({
      id: item.id,
      x,
      y,
      rotation: rotDeg,
      color,
      pathData,
      opacity: 0.5 + (importance / 10) * 0.45,
      animDelay: i * 0.1,
      ring,
    });
  });

  // --- Connections ---

  // 1. Spiral thread: connect sequential neighbors
  for (let i = 1; i < elements.length; i++) {
    const a = elements[i - 1];
    const b = elements[i];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist < spacing * 3.5) {
      connections.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        color: a.color,
        opacity: Math.max(0.04, 0.15 - dist / (spacing * 25)),
      });
    }
  }

  // 2. Ring web: connect elements in the same ring for mandala structure
  const byRing = new Map<number, PlacedElement[]>();
  for (const el of elements) {
    const arr = byRing.get(el.ring) || [];
    arr.push(el);
    byRing.set(el.ring, arr);
  }
  for (const ringEls of byRing.values()) {
    if (ringEls.length < 2) continue;
    for (let i = 0; i < ringEls.length; i++) {
      const a = ringEls[i];
      const b = ringEls[(i + 1) % ringEls.length];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < spacing * 5) {
        connections.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          color: a.color,
          opacity: 0.05,
        });
      }
    }
  }

  return { elements, connections };
}

// ============================================================================
// DEMO DATA (24 items across all worlds)
// ============================================================================

const DEMO_ITEMS: FractalItem[] = [
  // Quests (larger crystals)
  {
    id: "dq1",
    type: "quest",
    world: "health",
    importance: 8,
    completedAt: "2025-01-01",
  },
  {
    id: "dq2",
    type: "quest",
    world: "work",
    importance: 9,
    completedAt: "2025-01-15",
  },
  {
    id: "dq3",
    type: "quest",
    world: "relationships",
    importance: 7,
    completedAt: "2025-02-01",
  },
  {
    id: "dq4",
    type: "quest",
    world: "growth",
    importance: 8,
    completedAt: "2025-02-10",
  },
  {
    id: "dq5",
    type: "quest",
    world: "finance",
    importance: 6,
    completedAt: "2025-03-01",
  },
  {
    id: "dq6",
    type: "quest",
    world: "creativity",
    importance: 7,
    completedAt: "2025-03-15",
  },
  // Ops (medium crystals)
  {
    id: "do1",
    type: "op",
    world: "health",
    importance: 5,
    completedAt: "2025-01-05",
  },
  {
    id: "do2",
    type: "op",
    world: "work",
    importance: 6,
    completedAt: "2025-01-20",
  },
  {
    id: "do3",
    type: "op",
    world: "growth",
    importance: 4,
    completedAt: "2025-01-25",
  },
  {
    id: "do4",
    type: "op",
    world: "relationships",
    importance: 7,
    completedAt: "2025-02-05",
  },
  {
    id: "do5",
    type: "op",
    world: "finance",
    importance: 3,
    completedAt: "2025-02-15",
  },
  {
    id: "do6",
    type: "op",
    world: "creativity",
    importance: 5,
    completedAt: "2025-02-20",
  },
  {
    id: "do7",
    type: "op",
    world: "health",
    importance: 6,
    completedAt: "2025-03-05",
  },
  {
    id: "do8",
    type: "op",
    world: "work",
    importance: 8,
    completedAt: "2025-03-10",
  },
  // Tasks (small crystals)
  {
    id: "dt1",
    type: "task",
    world: "health",
    importance: 3,
    completedAt: "2025-01-02",
  },
  {
    id: "dt2",
    type: "task",
    world: "work",
    importance: 4,
    completedAt: "2025-01-10",
  },
  {
    id: "dt3",
    type: "task",
    world: "relationships",
    importance: 5,
    completedAt: "2025-01-18",
  },
  {
    id: "dt4",
    type: "task",
    world: "growth",
    importance: 3,
    completedAt: "2025-01-22",
  },
  {
    id: "dt5",
    type: "task",
    world: "finance",
    importance: 4,
    completedAt: "2025-02-08",
  },
  {
    id: "dt6",
    type: "task",
    world: "creativity",
    importance: 6,
    completedAt: "2025-02-12",
  },
  {
    id: "dt7",
    type: "task",
    world: "health",
    importance: 2,
    completedAt: "2025-02-25",
  },
  {
    id: "dt8",
    type: "task",
    world: "work",
    importance: 5,
    completedAt: "2025-03-02",
  },
  {
    id: "dt9",
    type: "task",
    world: "growth",
    importance: 4,
    completedAt: "2025-03-08",
  },
  {
    id: "dt10",
    type: "task",
    world: "relationships",
    importance: 3,
    completedAt: "2025-03-12",
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

/** Max elements with individual SVG animations (performance guard) */
const MAX_ANIMATED = 40;

export function FractalPattern({
  items,
  width = 200,
  height = 200,
  opacity = 0.55,
  animated = true,
  className,
}: FractalPatternProps) {
  const cx = width / 2;
  const cy = height / 2;

  const { elements, connections } = useMemo(() => {
    const effective = items && items.length > 0 ? items : DEMO_ITEMS;
    return generateLayout(effective, cx, cy);
  }, [items, cx, cy]);

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none",
        animated && "fractal-slow-rotate",
        className,
      )}
      style={{ opacity }}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          {/* Soft glow filter for crystal halos */}
          <filter
            id="fractal-glow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* --- Layer 1: Symmetry rays from center (subtle guides) --- */}
        {Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i;
          const maxR = Math.min(width, height) * 0.45;
          return (
            <line
              key={`ray-${i}`}
              x1={cx}
              y1={cy}
              x2={r1(cx + maxR * Math.cos(a))}
              y2={r1(cy + maxR * Math.sin(a))}
              stroke="white"
              strokeWidth="0.2"
              opacity="0.04"
              strokeDasharray="2 4"
            >
              {animated && (
                <animate
                  attributeName="opacity"
                  values="0.02;0.07;0.02"
                  dur={`${6 + i}s`}
                  repeatCount="indefinite"
                />
              )}
            </line>
          );
        })}

        {/* --- Layer 2: Connection web between elements --- */}
        {connections.map((c, i) => (
          <line
            key={`conn-${i}`}
            x1={r1(c.x1)}
            y1={r1(c.y1)}
            x2={r1(c.x2)}
            y2={r1(c.y2)}
            stroke={c.color}
            strokeWidth="0.3"
            opacity={c.opacity}
          >
            {animated && i < MAX_ANIMATED && (
              <animate
                attributeName="opacity"
                values={`${r1(c.opacity * 0.3)};${r1(c.opacity)};${r1(c.opacity * 0.3)}`}
                dur={`${5 + i * 0.15}s`}
                repeatCount="indefinite"
              />
            )}
          </line>
        ))}

        {/* --- Layer 3: Center seed crystal --- */}
        <circle cx={cx} cy={cy} r="2" fill="white" opacity="0.25">
          {animated && (
            <>
              <animate
                attributeName="r"
                values="1.5;3;1.5"
                dur="4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.12;0.35;0.12"
                dur="4s"
                repeatCount="indefinite"
              />
            </>
          )}
        </circle>

        {/* --- Layer 4: Crystal elements (completed items) --- */}
        {elements.map((el, i) => (
          <g
            key={el.id}
            transform={`translate(${r1(el.x)},${r1(el.y)}) rotate(${r1(el.rotation)})`}
          >
            {/* Glow halo */}
            <circle
              cx="0"
              cy="0"
              r="5"
              fill={el.color}
              opacity="0"
              filter="url(#fractal-glow)"
            >
              {animated && i < MAX_ANIMATED && (
                <animate
                  attributeName="opacity"
                  values="0;0.1;0"
                  dur={`${3.5 + el.animDelay * 0.3}s`}
                  begin={`${r1(el.animDelay)}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>

            {/* Crystal shape */}
            <path d={el.pathData} fill={el.color} opacity={el.opacity}>
              {animated && i < MAX_ANIMATED && (
                <animate
                  attributeName="opacity"
                  values={`${r1(el.opacity * 0.7)};${r1(el.opacity)};${r1(el.opacity * 0.7)}`}
                  dur={`${4 + el.animDelay * 0.2}s`}
                  begin={`${r1(el.animDelay)}s`}
                  repeatCount="indefinite"
                />
              )}
            </path>
          </g>
        ))}
      </svg>
    </div>
  );
}
