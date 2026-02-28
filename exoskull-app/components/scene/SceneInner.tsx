"use client";

import { Canvas } from "@react-three/fiber";
import { SceneController } from "./SceneController";
import { SpatialGrid } from "./SpatialGrid";
import { IORSOrb } from "./IORSOrb";
import type { IorsState } from "@/lib/hooks/useChatEngine";

interface SceneInnerProps {
  iorsState: IorsState;
  activeHashtag: string | null;
}

export default function SceneInner({
  iorsState,
  activeHashtag,
}: SceneInnerProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <SceneController />
      <SpatialGrid iorsState={iorsState} />
      <IORSOrb iorsState={iorsState} />
    </Canvas>
  );
}
