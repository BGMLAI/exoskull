"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { IorsState } from "@/lib/hooks/useChatEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitItem {
  id: string;
  label: string;
  kind: "tag" | "doc";
}

interface OrbitingTopicsProps {
  tags: string[];
  docNames?: string[];
  iorsState: IorsState;
  onTagClick?: (tag: string) => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ORB_CENTER: [number, number, number] = [0, 2, 0];
const TAG_ORBIT_RADIUS = 3.2;
const DOC_ORBIT_RADIUS = 4.8;
const TAG_COLOR = "#06b6d4"; // cyan
const DOC_COLOR = "#f59e0b"; // amber

const STATE_SPEED: Record<IorsState, number> = {
  idle: 0.08,
  thinking: 0.25,
  speaking: 0.15,
  building: 0.35,
  listening: 0.1,
};

// ---------------------------------------------------------------------------
// Single orbiting node
// ---------------------------------------------------------------------------

function OrbitNode({
  item,
  radius,
  angleOffset,
  yOffset,
  speed,
  iorsState,
  onClick,
}: {
  item: OrbitItem;
  radius: number;
  angleOffset: number;
  yOffset: number;
  speed: number;
  iorsState: IorsState;
  onClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const angleRef = useRef(angleOffset);

  const color = item.kind === "tag" ? TAG_COLOR : DOC_COLOR;
  const size = item.kind === "tag" ? 0.22 : 0.3;

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    angleRef.current += speed * delta;
    const a = angleRef.current;

    // Circular orbit around ORB_CENTER
    const x = ORB_CENTER[0] + Math.cos(a) * radius;
    const z = ORB_CENTER[2] + Math.sin(a) * radius;
    // Gentle vertical bob
    const y = ORB_CENTER[1] + yOffset + Math.sin(a * 2 + angleOffset) * 0.15;

    groupRef.current.position.set(x, y, z);
    // Face center
    groupRef.current.lookAt(ORB_CENTER[0], y, ORB_CENTER[2]);
  });

  return (
    <group ref={groupRef} onClick={onClick}>
      {/* Sphere */}
      <mesh>
        <sphereGeometry args={[size, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, size + 0.2, 0]}
        fontSize={0.18}
        color="#e4e4e7"
        anchorX="center"
        anchorY="bottom"
        maxWidth={2}
      >
        {item.kind === "tag" ? `#${item.label}` : item.label}
      </Text>

      {/* Faint trail ring segment (just a glow) */}
      <mesh>
        <sphereGeometry args={[size * 1.5, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.04}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Orbit ring (faint circle showing the path)
// ---------------------------------------------------------------------------

function OrbitRing({
  radius,
  color,
  y,
}: {
  radius: number;
  color: string;
  y: number;
}) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(
          ORB_CENTER[0] + Math.cos(a) * radius,
          ORB_CENTER[1] + y,
          ORB_CENTER[2] + Math.sin(a) * radius,
        ),
      );
    }
    return pts;
  }, [radius, y]);

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.08} />
    </line>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OrbitingTopics({
  tags,
  docNames,
  iorsState,
  onTagClick,
}: OrbitingTopicsProps) {
  const speed = STATE_SPEED[iorsState];

  // Build orbit items
  const items = useMemo(() => {
    const result: OrbitItem[] = [];
    for (const tag of tags) {
      result.push({ id: `tag-${tag}`, label: tag, kind: "tag" });
    }
    for (const doc of docNames || []) {
      result.push({ id: `doc-${doc}`, label: doc, kind: "doc" });
    }
    return result;
  }, [tags, docNames]);

  const tagItems = items.filter((i) => i.kind === "tag");
  const docItems = items.filter((i) => i.kind === "doc");

  if (items.length === 0) return null;

  return (
    <group>
      {/* Orbit path rings */}
      {tagItems.length > 0 && (
        <OrbitRing radius={TAG_ORBIT_RADIUS} color={TAG_COLOR} y={0} />
      )}
      {docItems.length > 0 && (
        <OrbitRing radius={DOC_ORBIT_RADIUS} color={DOC_COLOR} y={0.3} />
      )}

      {/* Tag nodes — inner ring */}
      {tagItems.map((item, i) => (
        <OrbitNode
          key={item.id}
          item={item}
          radius={TAG_ORBIT_RADIUS}
          angleOffset={(i / Math.max(tagItems.length, 1)) * Math.PI * 2}
          yOffset={0}
          speed={speed}
          iorsState={iorsState}
          onClick={onTagClick ? () => onTagClick(item.label) : undefined}
        />
      ))}

      {/* Document nodes — outer ring, slightly higher, opposite direction */}
      {docItems.map((item, i) => (
        <OrbitNode
          key={item.id}
          item={item}
          radius={DOC_ORBIT_RADIUS}
          angleOffset={(i / Math.max(docItems.length, 1)) * Math.PI * 2}
          yOffset={0.3}
          speed={-speed * 0.7}
          iorsState={iorsState}
        />
      ))}
    </group>
  );
}
