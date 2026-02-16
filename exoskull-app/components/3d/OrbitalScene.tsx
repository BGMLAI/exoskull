"use client";

import { useMemo } from "react";
import { WorldOrb, type WorldOrbData } from "./WorldOrb";
import { EphemeralThread } from "./EphemeralThread";
import { GridRoad } from "./GridRoad";

interface OrbitalSceneProps {
  worlds: WorldOrbData[];
  onWorldClick?: (worldId: string) => void;
}

/**
 * Composes all orbital elements: world orbs, ephemeral threads, grid road.
 * Worlds are data-driven — starts empty, user+IORS co-create them.
 */
export function OrbitalScene({ worlds, onWorldClick }: OrbitalSceneProps) {
  // Generate threads between all world pairs (ephemeral connections)
  const threadPairs = useMemo(() => {
    const pairs: {
      from: [number, number, number];
      to: [number, number, number];
      phase: number;
    }[] = [];
    for (let i = 0; i < worlds.length; i++) {
      for (let j = i + 1; j < worlds.length; j++) {
        pairs.push({
          from: worlds[i].position,
          to: worlds[j].position,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    return pairs;
  }, [worlds]);

  return (
    <group>
      {/* World orbs */}
      {worlds.map((world, i) => (
        <WorldOrb
          key={world.id}
          world={world}
          phaseOffset={i * 1.2}
          onClick={onWorldClick}
        />
      ))}

      {/* Ephemeral threads between worlds */}
      {threadPairs.map((tp, i) => (
        <EphemeralThread
          key={`thread-${i}`}
          from={tp.from}
          to={tp.to}
          phaseOffset={tp.phase}
        />
      ))}

      {/* Grid road (progress path) */}
      <GridRoad tileCount={16} />
    </group>
  );
}
