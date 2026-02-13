/**
 * NeuralBackground — Animated neural network background
 *
 * Creates a subtle, animated mesh of connected nodes that pulses
 * with system activity. Used throughout the UI for the "neural network" theme.
 *
 * Lightweight: CSS-only animation, no canvas/WebGL overhead.
 */
"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  /** Number of nodes (default: 15) */
  nodeCount?: number;
  /** Whether to show connection lines (default: true) */
  showConnections?: boolean;
  /** Opacity override (default: auto based on theme) */
  opacity?: number;
  /** Additional CSS classes */
  className?: string;
  /** Pulse intensity — controls how much nodes "breathe" */
  pulseIntensity?: "subtle" | "normal" | "strong";
}

interface Node {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

interface Connection {
  from: number;
  to: number;
  opacity: number;
}

export function NeuralBackground({
  nodeCount = 15,
  showConnections = true,
  opacity,
  className,
  pulseIntensity = "subtle",
}: NeuralBackgroundProps) {
  // Generate stable random nodes
  const { nodes, connections } = useMemo(() => {
    const seed = 42; // Deterministic layout
    const rng = mulberry32(seed);

    const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
      id: i,
      x: rng() * 100,
      y: rng() * 100,
      size: 2 + rng() * 4,
      delay: rng() * 5,
      duration: 3 + rng() * 4,
    }));

    // Connect nearby nodes
    const connections: Connection[] = [];
    if (showConnections) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 35) {
            connections.push({
              from: i,
              to: j,
              opacity: Math.max(0.1, 1 - dist / 35),
            });
          }
        }
      }
    }

    return { nodes, connections };
  }, [nodeCount, showConnections]);

  const pulseScale = {
    subtle: "scale-[0.95]",
    normal: "scale-90",
    strong: "scale-75",
  }[pulseIntensity];

  const baseOpacity = opacity ?? 0.06;

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none",
        className,
      )}
      style={{ opacity: baseOpacity }}
      aria-hidden="true"
    >
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection lines */}
        {connections.map((conn, i) => (
          <line
            key={`c-${i}`}
            x1={`${nodes[conn.from].x}%`}
            y1={`${nodes[conn.from].y}%`}
            x2={`${nodes[conn.to].x}%`}
            y2={`${nodes[conn.to].y}%`}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity={conn.opacity * 0.3}
            className="text-primary"
          >
            <animate
              attributeName="opacity"
              values={`${conn.opacity * 0.1};${conn.opacity * 0.4};${conn.opacity * 0.1}`}
              dur={`${4 + i * 0.3}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <circle
            key={`n-${node.id}`}
            cx={`${node.x}%`}
            cy={`${node.y}%`}
            r={node.size}
            className="fill-primary"
          >
            <animate
              attributeName="r"
              values={`${node.size * 0.7};${node.size * 1.3};${node.size * 0.7}`}
              dur={`${node.duration}s`}
              begin={`${node.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0.8;0.3"
              dur={`${node.duration}s`}
              begin={`${node.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

/**
 * Deterministic PRNG (for consistent layout across renders)
 */
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
