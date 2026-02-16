"use client";

import { useMemo } from "react";
import { OrbCluster } from "./OrbCluster";
import { EphemeralThread } from "./EphemeralThread";
import { GridRoad } from "./GridRoad";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { useOrbData } from "@/lib/hooks/useOrbData";
import type { OrbNode } from "@/lib/types/orb-types";

interface OrbitalSceneProps {
  onPointerMissed?: () => void;
}

/**
 * Composes orbital elements using recursive OrbCluster components.
 * Depth-aware: renders different views based on navStack.
 */
export function OrbitalScene({ onPointerMissed }: OrbitalSceneProps) {
  const navStack = useCockpitStore((s) => s.navStack);
  const drillInto = useCockpitStore((s) => s.drillInto);
  const openPreview = useCockpitStore((s) => s.openPreview);
  const { rootNodes, getNode, loadChildren } = useOrbData();

  const depth = navStack.length;

  // Find the currently focused node (deepest in stack)
  const focusedNode = useMemo(() => {
    if (depth === 0) return null;
    const lastEntry = navStack[depth - 1];
    return getNode(lastEntry.id);
  }, [depth, navStack, getNode]);

  // Determine which nodes to render as main orbs.
  // Orbs only for depth 0 (Values) and depth 1 (Loops).
  // Depth 2+ is handled by 2D HierarchyTree in CenterViewport.
  const visibleNodes: OrbNode[] = useMemo(() => {
    if (depth === 0) return rootNodes;
    if (depth === 1 && focusedNode && focusedNode.children.length > 0) {
      return focusedNode.children;
    }
    // At depth 2+, keep showing the same Loop-level orbs (3D stays at level 1)
    if (depth >= 2) {
      const parentEntry = navStack[0]; // The Value
      const parentNode = getNode(parentEntry.id);
      if (parentNode && parentNode.children.length > 0) {
        return parentNode.children;
      }
    }
    return rootNodes;
  }, [depth, focusedNode, rootNodes, navStack, getNode]);

  // Generate positions for visible nodes
  const nodePositions = useMemo(() => {
    const count = visibleNodes.length;
    if (count === 0) return [];

    // Distribute in a circle centered at scene origin
    const circleRadius = depth === 0 ? 14 : 10;
    const baseY = depth === 0 ? 6 : 4;

    return visibleNodes.map((_, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      const pos: [number, number, number] = [
        Math.cos(angle) * circleRadius,
        baseY + Math.sin(angle * 1.5) * 2,
        Math.sin(angle) * circleRadius,
      ];
      return pos;
    });
  }, [visibleNodes, depth]);

  // Thread pairs between visible orbs (overview-level only, fade when zoomed)
  const threadPairs = useMemo(() => {
    if (depth > 0) return []; // No threads when zoomed in
    const pairs: {
      from: [number, number, number];
      to: [number, number, number];
      phase: number;
    }[] = [];
    for (let i = 0; i < nodePositions.length; i++) {
      for (let j = i + 1; j < nodePositions.length; j++) {
        pairs.push({
          from: nodePositions[i],
          to: nodePositions[j],
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    return pairs;
  }, [nodePositions, depth]);

  const handleDrillIn = (node: OrbNode) => {
    // Lazy-load children if not yet loaded
    if (!node.childrenLoaded) {
      loadChildren(node.id);
    }
    drillInto({ id: node.id, type: node.type, label: node.label });
  };

  const handleLeafClick = (node: OrbNode) => {
    openPreview({
      type: "value",
      id: node.id,
      title: node.label,
      data: {
        nodeType: node.type,
        status: node.status,
        description: node.description,
        dueDate: node.dueDate,
        priority: node.priority,
        progress: node.progress,
        imageUrl: node.imageUrl,
      },
    });
  };

  // Determine the orb radius based on depth
  const orbRadius = depth === 0 ? 1.5 : 1.2;

  return (
    <group onPointerMissed={onPointerMissed}>
      {/* Visible orb clusters */}
      {visibleNodes.map((node, i) => (
        <OrbCluster
          key={node.id}
          node={node}
          position={nodePositions[i]}
          radius={orbRadius}
          isFocused={depth > 0} // All nodes at current level are "focused" (interactive moons)
          isBackground={false}
          onDrillIn={handleDrillIn}
          onLeafClick={handleLeafClick}
          phaseOffset={i * 1.2}
        />
      ))}

      {/* Ephemeral threads between orbs (overview only) */}
      {threadPairs.map((tp, i) => (
        <EphemeralThread
          key={`thread-${i}`}
          from={tp.from}
          to={tp.to}
          phaseOffset={tp.phase}
        />
      ))}

      {/* Grid road */}
      <GridRoad tileCount={16} />
    </group>
  );
}
