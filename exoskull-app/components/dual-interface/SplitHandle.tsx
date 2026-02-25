"use client";

import { useInterfaceStore } from "@/lib/stores/useInterfaceStore";
import React, { useCallback } from "react";

interface SplitHandleProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function SplitHandle({ containerRef }: SplitHandleProps) {
  const setSplitRatio = useInterfaceStore((s) => s.setSplitRatio);

  const handleDoubleClick = useCallback(() => {
    setSplitRatio(0.5);
  }, [setSplitRatio]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const onPointerMove = (ev: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const ratio = Math.max(
          0.15,
          Math.min(0.85, (ev.clientX - rect.left) / rect.width),
        );
        setSplitRatio(ratio);
      };

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [containerRef, setSplitRatio],
  );

  return (
    <div
      className="group relative z-20 flex w-2 cursor-col-resize items-center justify-center hover:bg-zinc-700/30"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="h-8 w-0.5 rounded-full bg-zinc-600 transition-colors group-hover:bg-zinc-400" />
    </div>
  );
}
