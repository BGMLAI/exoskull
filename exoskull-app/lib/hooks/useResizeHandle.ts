"use client";

import { useCallback, useRef, useState } from "react";

interface UseResizeHandleOptions {
  /** Current width in pixels */
  initialWidth: number;
  /** Minimum allowed width */
  min: number;
  /** Maximum allowed width */
  max: number;
  /** Called with new width on drag */
  onResize: (width: number) => void;
  /** "left" = dragging right increases width, "right" = dragging left increases width */
  side: "left" | "right";
}

/**
 * Custom hook for drag-to-resize columns.
 * Adapted from the SplitHandle pointer-event pattern.
 */
export function useResizeHandle({
  initialWidth,
  min,
  max,
  onResize,
  side,
}: UseResizeHandleOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(initialWidth);
  const rafRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = initialWidth;
      setIsResizing(true);

      const handleMouseMove = (ev: MouseEvent) => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const delta = ev.clientX - startXRef.current;
          const newWidth =
            side === "left"
              ? startWidthRef.current + delta
              : startWidthRef.current - delta;
          onResize(Math.round(Math.max(min, Math.min(max, newWidth))));
        });
      };

      const handleMouseUp = () => {
        cancelAnimationFrame(rafRef.current);
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [initialWidth, min, max, onResize, side],
  );

  return {
    handleProps: {
      onMouseDown: handleMouseDown,
      style: { cursor: "col-resize" as const },
    },
    isResizing,
  };
}
