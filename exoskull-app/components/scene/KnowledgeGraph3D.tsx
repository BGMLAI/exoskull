"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSpatialStore } from "@/lib/stores/useSpatialStore";

// Dynamic import — ForceGraph3D uses Three.js (no SSR)
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => null,
});

// ---------------------------------------------------------------------------
// Types — match the SSE graph event shape
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  name: string;
  type: string; // document, conversation, note, email, web, voice
  chunks: number;
  color: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  similarity: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGraph3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [status, setStatus] = useState<string>("connecting");
  const setActiveHashtag = useSpatialStore((s) => s.setActiveHashtag);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // SSE connection to /api/knowledge-graph
  useEffect(() => {
    const es = new EventSource("/api/knowledge-graph");
    setStatus("connecting");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "status":
            setStatus(data.status);
            break;

          case "graph":
            if (data.nodes && data.links) {
              setGraphData({
                nodes: data.nodes,
                links: data.links,
              });
              setStatus("ready");
            }
            break;

          case "done":
            es.close();
            break;

          case "error":
            console.error("[KnowledgeGraph3D] SSE error:", data.message);
            setStatus("error");
            es.close();
            break;
        }
      } catch (err) {
        console.error("[KnowledgeGraph3D] Failed to parse SSE event:", err);
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  // Node click → set active hashtag filter
  const handleNodeClick = useCallback(
    (node: any) => {
      if (node.name) {
        setActiveHashtag(node.name);
      }
    },
    [setActiveHashtag],
  );

  // Custom node rendering — spheres with glow
  const nodeThreeObject = useCallback((node: any) => {
    const THREE = require("three");
    const group = new THREE.Group();

    // Node size based on chunk count
    const baseSize = node.chunks > 5 ? 1.4 : node.chunks > 2 ? 1.0 : 0.6;
    const geo = new THREE.SphereGeometry(baseSize, 16, 16);
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(node.color),
      emissive: new THREE.Color(node.color),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Glow halo for larger documents
    if (node.chunks > 3) {
      const glowGeo = new THREE.SphereGeometry(baseSize * 1.6, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));
    }

    return group;
  }, []);

  // Link width based on similarity
  const linkWidth = useCallback((link: any) => {
    return Math.max(0.3, (link.similarity || 0.3) * 2);
  }, []);

  // Determine theme from document class
  const isDark = useMemo(() => {
    if (typeof document === "undefined") return true;
    const html = document.documentElement;
    return (
      html.classList.contains("dark-ops") ||
      html.classList.contains("dark") ||
      html.classList.contains("neural") ||
      html.classList.contains("cyberpunk")
    );
  }, []);

  // Loading/empty state
  if (status === "connecting" || status === "loading_embeddings") {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">
          Loading knowledge graph...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      {dimensions.width > 0 && graphData.nodes.length > 0 && (
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeThreeObject={nodeThreeObject}
          nodeLabel={(node: any) =>
            `${node.name} (${node.type}, ${node.chunks} chunks)`
          }
          linkColor={() =>
            isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"
          }
          linkWidth={linkWidth}
          linkOpacity={0.3}
          onNodeClick={handleNodeClick}
          enableNavigationControls
          showNavInfo={false}
          warmupTicks={50}
          cooldownTime={3000}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  );
}
