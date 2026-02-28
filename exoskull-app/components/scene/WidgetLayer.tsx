"use client";

import { useMemo } from "react";
import { WidgetCard3D } from "./WidgetCard3D";
import { HashtagNode } from "./HashtagNode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Widget3D {
  id: string;
  title: string;
  hashtag?: string;
  content?: React.ReactNode;
  position?: [number, number, number];
}

interface WidgetLayerProps {
  widgets: Widget3D[];
  hashtags: string[];
  activeHashtag: string | null;
  onHashtagClick: (tag: string) => void;
  onWidgetClick?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Fibonacci sphere distribution — evenly space N items on a sphere
// ---------------------------------------------------------------------------

function fibonacciSpherePositions(
  count: number,
  radius: number,
  yOffset: number = 2,
): [number, number, number][] {
  const positions: [number, number, number][] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // -1 to 1
    const r = Math.sqrt(1 - y * y) * radius;
    const theta = goldenAngle * i;

    positions.push([
      Math.cos(theta) * r,
      y * radius * 0.5 + yOffset,
      Math.sin(theta) * r,
    ]);
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WidgetLayer({
  widgets,
  hashtags,
  activeHashtag,
  onHashtagClick,
  onWidgetClick,
}: WidgetLayerProps) {
  // Filter widgets by active hashtag
  const filteredWidgets = useMemo(() => {
    if (!activeHashtag) return widgets;
    return widgets.filter((w) => w.hashtag === activeHashtag);
  }, [widgets, activeHashtag]);

  // Position widgets using Fibonacci sphere
  const widgetPositions = useMemo(
    () => fibonacciSpherePositions(filteredWidgets.length, 6, 2),
    [filteredWidgets.length],
  );

  // Position hashtags in a ring around the orb
  const hashtagPositions = useMemo(() => {
    return hashtags.map((_, i) => {
      const angle = (i / hashtags.length) * Math.PI * 2;
      const radius = 4;
      return [Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius] as [
        number,
        number,
        number,
      ];
    });
  }, [hashtags]);

  return (
    <group>
      {/* Hashtag nodes */}
      {hashtags.map((tag, i) => (
        <HashtagNode
          key={tag}
          label={tag}
          position={hashtagPositions[i]}
          isActive={activeHashtag === tag}
          onClick={() => onHashtagClick(tag)}
        />
      ))}

      {/* Widget cards */}
      {filteredWidgets.map((widget, i) => (
        <WidgetCard3D
          key={widget.id}
          position={widgetPositions[i] || [0, 2, 0]}
          onClick={() => onWidgetClick?.(widget.id)}
        >
          <h3 className="text-sm font-medium text-foreground">
            {widget.title}
          </h3>
          {widget.hashtag && (
            <span className="text-xs text-muted-foreground">
              #{widget.hashtag}
            </span>
          )}
          {widget.content}
        </WidgetCard3D>
      ))}
    </group>
  );
}
