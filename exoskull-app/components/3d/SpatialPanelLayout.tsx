/**
 * @deprecated Replaced by `components/cockpit/CockpitHUDShell.tsx` (Phase 8 — Cockpit HUD).
 * 3D spatial panels replaced by 2D HTML/CSS cockpit overlay. Kept for reference.
 */
"use client";

import { useRef, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SpatialPanel } from "./SpatialPanel";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { DEMO_WORLDS } from "@/lib/worlds/demo-worlds";

/* ─────────────────────────── Types ─────────────────────────── */

interface PanelConfig {
  panelId: string;
  sectionId: string;
  title: string;
  /** Position relative to camera (camera looks along local -Z) */
  position: [number, number, number];
  endpoint: string;
  accentColor: string;
}

/* ─────────────────── Cockpit panel positions ─────────────── */
/* Positions are LOCAL to the camera:
 *   x: left(-) / right(+)
 *   y: down(-) / up(+)
 *   z: negative = in front of camera
 */

const COCKPIT_PANELS: PanelConfig[] = [
  // ─── Left wing ───
  {
    panelId: "tasks",
    sectionId: "tasks",
    title: "Zadania",
    position: [-7, 1.5, -8],
    endpoint: "/api/canvas/data/tasks",
    accentColor: "#3b82f6",
  },
  {
    panelId: "activity",
    sectionId: "activity",
    title: "IORS",
    position: [-7, -0.5, -8],
    endpoint: "/api/canvas/activity-feed",
    accentColor: "#8b5cf6",
  },
  {
    panelId: "email",
    sectionId: "email",
    title: "Email",
    position: [-7, -2.5, -8],
    endpoint: "/api/canvas/data/emails",
    accentColor: "#06b6d4",
  },

  // ─── Right wing ───
  {
    panelId: "calendar",
    sectionId: "calendar",
    title: "Kalendarz",
    position: [7, 1.5, -8],
    endpoint: "/api/canvas/data/calendar",
    accentColor: "#f59e0b",
  },
  {
    panelId: "knowledge",
    sectionId: "knowledge",
    title: "Wiedza",
    position: [7, -0.5, -8],
    endpoint: "/api/knowledge",
    accentColor: "#10b981",
  },
];

/* ── World detail panel subsections (shown when an orb is clicked) ── */

const WORLD_SUBSECTIONS = [
  {
    panelId: "world-tasks",
    title: "Zadania",
    endpoint: "/api/canvas/data/tasks",
    accentColor: "#3b82f6",
  },
  {
    panelId: "world-knowledge",
    title: "Wiedza",
    endpoint: "/api/canvas/data/knowledge",
    accentColor: "#10b981",
  },
  {
    panelId: "world-calendar",
    title: "Kalendarz",
    endpoint: "/api/canvas/data/calendar",
    accentColor: "#f59e0b",
  },
];

/* ════════════════════════════════════════════════════════════════
 *  CockpitGroup — follows the camera every frame (HUD-like)
 * ════════════════════════════════════════════════════════════════ */

function CockpitGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    // Match camera transform — panels stay fixed relative to user's view
    groupRef.current.position.copy(camera.position);
    groupRef.current.quaternion.copy(camera.quaternion);
  });

  return <group ref={groupRef}>{children}</group>;
}

/* ════════════════════════════════════════════════════════════════
 *  SpatialPanelLayout — cockpit panels + world detail panels
 * ════════════════════════════════════════════════════════════════ */

export function SpatialPanelLayout() {
  const sections = useCockpitStore((s) => s.sections);
  const selectedWorldId = useCockpitStore((s) => s.selectedWorldId);

  /* Build a visibility lookup: sectionId -> boolean */
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const sec of sections) {
      map.set(sec.id, sec.visible);
    }
    return map;
  }, [sections]);

  /* Filter panels to only those whose section is visible */
  const visiblePanels = useMemo(
    () => COCKPIT_PANELS.filter((p) => visibilityMap.get(p.sectionId) === true),
    [visibilityMap],
  );

  /* World detail panels — shown near the selected world orb (world-space) */
  const selectedWorld = useMemo(
    () =>
      selectedWorldId
        ? DEMO_WORLDS.find((w) => w.id === selectedWorldId)
        : null,
    [selectedWorldId],
  );

  const worldDetailPanels = useMemo(() => {
    if (!selectedWorld) return [];
    const [wx, wy, wz] = selectedWorld.position;
    return WORLD_SUBSECTIONS.map((sub, i) => ({
      ...sub,
      position: [wx + 5, wy + 3 - i * 4, wz] as [number, number, number],
    }));
  }, [selectedWorld]);

  return (
    <>
      {/* ── Cockpit panels — follow the camera ── */}
      <CockpitGroup>
        {visiblePanels.map((panel) => (
          <SpatialPanel
            key={panel.panelId}
            panelId={panel.panelId}
            position={panel.position}
            title={panel.title}
            endpoint={panel.endpoint}
            accentColor={panel.accentColor}
            autoLoad
          />
        ))}
      </CockpitGroup>

      {/* ── World detail panels — world-space (near selected orb) ── */}
      {selectedWorld &&
        worldDetailPanels.map((panel) => (
          <SpatialPanel
            key={panel.panelId}
            panelId={panel.panelId}
            position={panel.position}
            title={`${selectedWorld.name} / ${panel.title}`}
            endpoint={panel.endpoint}
            accentColor={panel.accentColor}
            autoLoad
          />
        ))}
    </>
  );
}
