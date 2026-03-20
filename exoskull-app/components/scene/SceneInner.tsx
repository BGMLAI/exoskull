"use client";

import { Canvas } from "@react-three/fiber";
import { SceneController } from "./SceneController";
import { SpatialGrid } from "./SpatialGrid";
import { IORSOrb } from "./IORSOrb";
import { OrbitingTopics } from "./OrbitingTopics";
import { useSpatialStore } from "@/lib/stores/useSpatialStore";
import type { IorsState } from "@/lib/hooks/useChatEngine";

interface SceneInnerProps {
  iorsState: IorsState;
  activeHashtag: string | null;
}

export default function SceneInner({
  iorsState,
  activeHashtag,
}: SceneInnerProps) {
  const activeTask = useSpatialStore((s) => s.activeTask);
  const setActiveHashtag = useSpatialStore((s) => s.setActiveHashtag);

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <SceneController />
      <SpatialGrid iorsState={iorsState} />
      <IORSOrb iorsState={iorsState} />

      {/* Orbiting topic nodes when a task is active */}
      {activeTask && (
        <OrbitingTopics
          tags={activeTask.tags}
          docNames={activeTask.relatedDocIds}
          iorsState={iorsState}
          onTagClick={setActiveHashtag}
        />
      )}
    </Canvas>
  );
}
