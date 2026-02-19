"use client";

/**
 * MindMap3D — Force-directed 3D mind map using react-force-graph-3d.
 *
 * Renders OrbNode hierarchy as an interactive 3D graph.
 * Custom nodeThreeObject renders different visuals based on visualType.
 *
 * ALWAYS uses dark background for 3D visibility (orbs, glow, labels need dark bg).
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
import { OrbDeleteConfirm } from "@/components/cockpit/OrbDeleteConfirm";
import type { NodeVisualType, OrbNodeType } from "@/lib/types/orb-types";

// Dynamic import to avoid SSR issues with three.js
const ForceGraph3DComponent = dynamic(
  () => import("react-force-graph-3d").then((mod) => mod.default || mod),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#050510] text-cyan-400/60 font-mono text-sm">
        Inicjalizacja mapy mysli...
      </div>
    ),
  },
);

interface MindMap3DProps {
  width?: number;
  height?: number;
}

// 3D scene ALWAYS uses dark background — orbs, glow, and labels are designed for dark
const SCENE_BG = "#050510";

export function MindMap3D({ width, height }: MindMap3DProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  const { rootNodes, loadChildren, updateNode, removeNode } = useOrbData();
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

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    type: OrbNodeType;
  } | null>(null);

  // Auto-expand root values on mount
  useEffect(() => {
    if (rootNodes.length > 0 && expandedNodes.size === 0) {
      const rootIds = rootNodes.map((n) => n.id);
      useMindMapStore.getState().expandAll(rootIds);
    }
  }, [rootNodes, expandedNodes.size]);

  // Add lights to the scene after graph initializes
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene?.();
    if (!scene) return;

    // Check if we already added lights
    if (scene.getObjectByName("__exo_ambient")) return;

    // Ambient light for base visibility
    const ambient =
      new // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("three") as typeof import("three")).AmbientLight(0x404060, 0.5);
    ambient.name = "__exo_ambient";
    scene.add(ambient);

    // Directional light for depth
    const dir =
      new // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("three") as typeof import("three")).DirectionalLight(
        0xffffff,
        0.3,
      );
    dir.position.set(50, 100, 50);
    dir.name = "__exo_dir";
    scene.add(dir);
  });

  // Convert tree to graph data
  const graphData = useMemo(() => {
    const data = convertOrbTreeToGraph(rootNodes, expandedNodes);
    // Debug: log graph data stats on mount
    if (data.nodes.length > 0) {
      console.log("[MindMap3D] Graph data:", {
        nodes: data.nodes.length,
        links: data.links.length,
        sampleNode: {
          id: data.nodes[0].id,
          name: data.nodes[0].name,
          color: data.nodes[0].color,
          val: data.nodes[0].val,
          type: data.nodes[0].type,
          visualType: data.nodes[0].visualType,
        },
      });
    }
    return data;
  }, [rootNodes, expandedNodes]);

  // Create THREE.Object3D for each node based on its visualType
  // Wrapped in try-catch — ALWAYS returns a valid Object3D (never undefined)
  const nodeThreeObject = useCallback((node: Record<string, unknown>) => {
    try {
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
    } catch (error) {
      console.error("[MindMap3D] nodeThreeObject failed:", {
        error: error instanceof Error ? error.message : error,
        nodeId: node.id,
        color: node.color,
        val: node.val,
      });
      // Fallback: always return a visible sphere
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const THREE = require("three") as typeof import("three");
      const geo = new THREE.SphereGeometry(1, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(4);
      return mesh;
    }
  }, []);

  // Handle node click — zoom camera + expand (never collapse)
  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      const mapNode = node as unknown as MindMapNode;

      // Zoom camera to node
      if (fgRef.current) {
        const distance = 80;
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

      // If not expanded, expand (load children); if already expanded, just focus
      if (!expandedNodes.has(mapNode.id)) {
        expandNode(mapNode.id);
        loadChildren(mapNode.id);
      }
      setFocusedNode(mapNode.id);
    },
    [expandedNodes, expandNode, loadChildren, setFocusedNode],
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
    (nodeId: string, visualType: NodeVisualType) => {
      const node = graphData.nodes.find(
        (n) => (n as MindMapNode).id === nodeId,
      ) as MindMapNode | undefined;
      if (node) {
        updateNode(nodeId, node.type, { visualType });
      }
    },
    [graphData.nodes, updateNode],
  );

  // Handle model selection from ModelPicker
  const handleModelSelect = useCallback(
    (modelUrl: string, thumbnailUrl?: string) => {
      if (modelPickerNodeId) {
        const node = graphData.nodes.find(
          (n) => (n as MindMapNode).id === modelPickerNodeId,
        ) as MindMapNode | undefined;
        if (node) {
          updateNode(modelPickerNodeId, node.type, {
            visualType: "model3d",
            modelUrl,
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
          });
        }
      }
      setModelPickerNodeId(null);
    },
    [modelPickerNodeId, graphData.nodes, updateNode],
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
        return "rgba(0, 212, 255, 0.8)";
      }
      return (link.color as string) || "rgba(100, 180, 255, 0.4)";
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
        backgroundColor={SCENE_BG}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={handleNodeHover}
        linkColor={linkColor}
        dagMode="radialout"
        dagLevelDistance={60}
        linkWidth={2}
        linkOpacity={0.6}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={2}
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
          onDelete={(nodeId, nodeType) => {
            const n = graphData.nodes.find((n) => n.id === nodeId);
            setDeleteTarget({
              id: nodeId,
              name: n?.name || nodeId,
              type: nodeType as OrbNodeType,
            });
          }}
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

      {/* Delete confirmation dialog */}
      <OrbDeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        nodeLabel={deleteTarget?.name || ""}
        nodeType={deleteTarget?.type || "op"}
        onConfirm={async () => {
          if (!deleteTarget) return false;
          return removeNode(deleteTarget.id, deleteTarget.type);
        }}
      />
    </div>
  );
}
