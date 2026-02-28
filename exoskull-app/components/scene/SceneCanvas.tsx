"use client";

import dynamic from "next/dynamic";
import type { IorsState } from "@/lib/hooks/useChatEngine";

// Dynamic import — R3F breaks SSR
const SceneInner = dynamic(() => import("./SceneInner"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
  ),
});

interface SceneCanvasProps {
  iorsState: IorsState;
  activeHashtag: string | null;
  is3DMode: boolean;
}

export function SceneCanvas({
  iorsState,
  activeHashtag,
  is3DMode,
}: SceneCanvasProps) {
  if (!is3DMode) {
    // 2D fallback — CSS gradient background
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
    );
  }

  return (
    <div className="absolute inset-0">
      <SceneInner iorsState={iorsState} activeHashtag={activeHashtag} />
    </div>
  );
}
