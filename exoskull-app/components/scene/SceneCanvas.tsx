"use client";

import dynamic from "next/dynamic";
import type { IorsState } from "@/lib/hooks/useChatEngine";
import type { SceneMode } from "@/lib/stores/useSpatialStore";

// Dynamic imports — both use Three.js / WebGL (no SSR)
const SceneInner = dynamic(() => import("./SceneInner"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
  ),
});

const KnowledgeGraph3DLazy = dynamic(
  () =>
    import("./KnowledgeGraph3D").then((m) => ({
      default: m.KnowledgeGraph3D,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
    ),
  },
);

interface SceneCanvasProps {
  iorsState: IorsState;
  activeHashtag: string | null;
  is3DMode: boolean;
  sceneMode: SceneMode;
}

export function SceneCanvas({
  iorsState,
  activeHashtag,
  is3DMode,
  sceneMode,
}: SceneCanvasProps) {
  if (!is3DMode) {
    // 2D fallback — CSS gradient background
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
    );
  }

  // Graph mode (idle) → 3D force-directed knowledge graph
  if (sceneMode === "graph") {
    return (
      <div className="absolute inset-0">
        <KnowledgeGraph3DLazy />
      </div>
    );
  }

  // Orb mode (active) → R3F scene with IORS orb
  return (
    <div className="absolute inset-0">
      <SceneInner iorsState={iorsState} activeHashtag={activeHashtag} />
    </div>
  );
}
