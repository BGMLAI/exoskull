"use client";

/**
 * MindMap3D — Force-directed 3D mind map using react-force-graph-3d.
 *
 * Renders OrbNode hierarchy as an interactive 3D graph.
 * Custom nodeThreeObject renders different visuals based on visualType.
 */

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";
import { convertOrbTreeToGraph } from "@/lib/mindmap/graph-converter";
import { useMindMapStore } from "@/lib/stores/useMindMapStore";
import { useOrbData } from "@/lib/hooks/useOrbData";
import { createOrbObject } from "./node-renderers/OrbRenderer";
import { createImageObject } from "./node-renderers/ImageRenderer";
import { createModelObject } from "./node-renderers/ModelRenderer";
import { createCardObject } from "./node-renderers/CardRenderer";
import { NodeContextMenu } from "./NodeContextMenu";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { ModelPicker } from "./ModelPicker";
import type { NodeVisualType } from "@/lib/types/orb-types";

// Dynamic import to avoid SSR issues with three.js
const ForceGraph3DComponent = dynamic(
  () => import("react-force-graph-3d").then((mod) => mod.default || mod),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-cyan-400/60 font-mono text-sm">
        Inicjalizacja mapy mysli...
      </div>
    ),
  },
);

interface MindMap3DProps {
  width?: number;
  height?: number;
}

export function MindMap3D({ width, height }: MindMap3DProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const { rootNodes, loadChildren } = useOrbData();
  const {
    expandedNodes,
    focusedNodeId,
    hoveredNodeId,
    toggleExpanded,
    setFocusedNode,
    setHoveredNode,
    expandNode,
  } = useMindMapStore();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    node: MindMapNode;
    x: number;
    y: number;
  } | null>(null);

  // Detail panel state
  const [detailNode, setDetailNode] = useState<MindMapNode | null>(null);

  // Model picker state
  const [modelPickerNodeId, setModelPickerNodeId] = useState<string | null>(
    null,
  );

  // Auto-expand root values on mount
  useEffect(() => {
    if (rootNodes.length > 0 && expandedNodes.size === 0) {
      const rootIds = rootNodes.map((n) => n.id);
      useMindMapStore.getState().expandAll(rootIds);
    }
  }, [rootNodes, expandedNodes.size]);

  // Convert tree to graph data
  const graphData = useMemo(() => {
    return convertOrbTreeToGraph(rootNodes, expandedNodes);
  }, [rootNodes, expandedNodes]);

  // Create THREE.Object3D for each node based on its visualType
  const nodeThreeObject = useCallback((node: Record<string, unknown>) => {
    const mapNode = node as unknown as MindMapNode;
    switch (mapNode.visualType) {
      case "image":
        return createImageObject(mapNode);
      case "model3d":
        return createModelObject(mapNode);
      case "card":
        return createCardObject(mapNode);
      case "orb":
      default:
        return createOrbObject(mapNode);
    }
  }, []);

  // Handle node click — zoom camera + toggle expand
  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      const mapNode = node as unknown as MindMapNode;

      // Zoom camera to node
      if (fgRef.current) {
        const distance = 100;
        const nodePos = node as { x?: number; y?: number; z?: number };
        fgRef.current.cameraPosition(
          {
            x: (nodePos.x || 0) + distance,
            y: (nodePos.y || 0) + distance * 0.5,
            z: (nodePos.z || 0) + distance,
          },
          { x: nodePos.x || 0, y: nodePos.y || 0, z: nodePos.z || 0 },
          1000,
        );
      }

      // Toggle expand and load children
      toggleExpanded(mapNode.id);
      loadChildren(mapNode.id);
      setFocusedNode(mapNode.id);
    },
    [toggleExpanded, loadChildren, setFocusedNode],
  );

  // Handle node hover
  const handleNodeHover = useCallback(
    (node: Record<string, unknown> | null) => {
      setHoveredNode((node?.id as string) || null);
      document.body.style.cursor = node ? "pointer" : "auto";
    },
    [setHoveredNode],
  );

  // Handle right-click context menu
  const handleNodeRightClick = useCallback(
    (node: Record<string, unknown>, event: MouseEvent) => {
      event.preventDefault();
      const mapNode = node as unknown as MindMapNode;
      setContextMenu({
        node: mapNode,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  // Handle visual type change
  const handleChangeVisual = useCallback(
    (_nodeId: string, _visualType: NodeVisualType) => {
      // TODO: persist to API when backend supports it
      // For now this is visual-only in the context menu
    },
    [],
  );

  // Handle model selection from ModelPicker
  const handleModelSelect = useCallback(
    (modelUrl: string, _thumbnailUrl?: string) => {
      // TODO: persist to API when backend supports it
      setModelPickerNodeId(null);
    },
    [],
  );

  // Link color with glow for focused paths
  const linkColor = useCallback(
    (link: Record<string, unknown>) => {
      const source =
        typeof link.source === "object"
          ? (link.source as { id?: string })?.id
          : link.source;
      const target =
        typeof link.target === "object"
          ? (link.target as { id?: string })?.id
          : link.target;

      if (source === focusedNodeId || target === focusedNodeId) {
        return "rgba(0, 212, 255, 0.5)";
      }
      return (link.color as string) || "rgba(100, 130, 180, 0.15)";
    },
    [focusedNodeId],
  );

  return (
    <div className="relative w-full h-full">
      <ForceGraph3DComponent
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="#050510"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={handleNodeHover}
        linkColor={linkColor}
        linkWidth={1}
        linkOpacity={0.3}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => "#00d4ff"}
        warmupTicks={50}
        cooldownTime={3000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        enableNavigationControls={true}
        showNavInfo={false}
      />

      {/* Node count badge */}
      <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur border border-cyan-900/30 rounded-lg font-mono text-[11px] text-cyan-400/60">
        {graphData.nodes.length} nodes · {graphData.links.length} links
      </div>

      {/* Hovered node tooltip */}
      {hoveredNodeId && !contextMenu && (
        <div className="absolute top-3 left-3 px-3 py-2 bg-black/70 backdrop-blur border border-cyan-900/30 rounded-lg max-w-xs">
          {(() => {
            const n = graphData.nodes.find((n) => n.id === hoveredNodeId);
            if (!n) return null;
            return (
              <>
                <div className="font-mono text-xs text-cyan-400 uppercase tracking-wider mb-1">
                  {n.type}
                </div>
                <div className="text-sm text-white font-medium">{n.name}</div>
                {n.description && (
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {n.description}
                  </div>
                )}
                {n.status && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    Status: {n.status}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <NodeContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          isExpanded={expandedNodes.has(contextMenu.node.id)}
          onClose={() => setContextMenu(null)}
          onToggleExpand={(id) => {
            toggleExpanded(id);
            loadChildren(id);
          }}
          onChangeVisual={handleChangeVisual}
          onOpenModelPicker={(id) => setModelPickerNodeId(id)}
          onViewDetails={(node) => setDetailNode(node)}
        />
      )}

      {/* Detail panel */}
      <NodeDetailPanel node={detailNode} onClose={() => setDetailNode(null)} />

      {/* Model picker dialog */}
      <ModelPicker
        isOpen={modelPickerNodeId !== null}
        onClose={() => setModelPickerNodeId(null)}
        onSelect={handleModelSelect}
      />
    </div>
  );
}
