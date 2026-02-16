"use client";

import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbNode } from "@/lib/types/orb-types";
import { isLeafType } from "@/lib/types/orb-types";

interface OrbClusterProps {
  node: OrbNode;
  position: [number, number, number];
  radius: number;
  isFocused: boolean;
  isBackground: boolean;
  onDrillIn: (node: OrbNode) => void;
  onLeafClick: (node: OrbNode) => void;
  phaseOffset?: number;
}

/**
 * Recursive orb component — renders a central orb with children as orbiting moons.
 * When focused, moons freeze in place (static circle) for easy clicking.
 * Children fade in with staggered delay.
 */
export function OrbCluster({
  node,
  position,
  radius,
  isFocused,
  isBackground,
  onDrillIn,
  onLeafClick,
  phaseOffset = 0,
}: OrbClusterProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const colorObj = useMemo(() => new THREE.Color(node.color), [node.color]);
  const colorNum = colorObj.getHex();

  // Scale: focused orbs are bigger, background orbs fade
  const scale = isFocused ? 1.3 : isBackground ? 0.8 : 1.0;
  const opacity = isBackground ? 0.15 : 1.0;

  // Moon orbit config
  const moonOrbitRadius = radius * 2.8;
  const moonSize = radius * 0.3;

  // Performance: cap visible children at 15
  const MAX_VISIBLE_CHILDREN = 15;
  const visibleChildren = node.children.slice(0, MAX_VISIBLE_CHILDREN);
  const hiddenCount = Math.max(0, node.children.length - MAX_VISIBLE_CHILDREN);

  // Animate floating
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.position.y =
        position[1] + Math.sin(t * 0.6 + phaseOffset) * 0.5;
      meshRef.current.rotation.y = t * 0.15 + phaseOffset;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isLeafType(node.type)) {
      onLeafClick(node);
    } else {
      onDrillIn(node);
    }
  };

  return (
    <group ref={groupRef}>
      {/* Central orb */}
      <mesh
        ref={meshRef}
        position={position}
        scale={[scale, scale, scale]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={colorNum}
          emissive={colorNum}
          emissiveIntensity={hovered ? 1.0 : isFocused ? 0.8 : 0.6}
          metalness={0.3}
          roughness={0.4}
          transparent={isBackground}
          opacity={opacity}
        />

        {/* Glow halo */}
        <mesh>
          <sphereGeometry args={[radius * (hovered ? 1.5 : 1.35), 16, 16]} />
          <meshBasicMaterial
            color={colorNum}
            transparent
            opacity={(hovered ? 0.18 : 0.08) * opacity}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Point light */}
        <pointLight
          color={colorNum}
          intensity={(hovered ? 1.2 : 0.6) * opacity}
          distance={15}
        />

        {/* Label + optional image */}
        <Html
          position={[0, radius + 1.0, 0]}
          center
          distanceFactor={20}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              opacity: isBackground ? 0.15 : hovered ? 1 : 0.6,
              transition: "opacity 0.2s",
            }}
          >
            {node.imageUrl && isFocused && (
              <img
                src={node.imageUrl}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  objectFit: "cover",
                  border: `2px solid ${node.color}80`,
                  boxShadow: `0 0 12px ${node.color}40`,
                }}
              />
            )}
            <span
              style={{
                color: "white",
                fontSize: "13px",
                fontWeight: 600,
                textShadow: `0 0 12px ${node.color}, 0 0 4px rgba(0,0,0,0.8)`,
                whiteSpace: "nowrap",
              }}
            >
              {node.label}
            </span>
          </div>
        </Html>

        {/* Orbit ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 2.5, radius * 2.5 + 0.04, 64]} />
          <meshBasicMaterial
            color={colorNum}
            transparent
            opacity={0.15 * opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      </mesh>

      {/* Children as moons — orbiting (unfocused) or static circle (focused) */}
      {!isBackground &&
        visibleChildren.map((child, i) => (
          <MoonOrb
            key={child.id}
            child={child}
            parentPosition={position}
            parentColor={node.color}
            orbitRadius={moonOrbitRadius}
            moonSize={moonSize}
            index={i}
            total={visibleChildren.length}
            phaseOffset={phaseOffset}
            isFocused={isFocused}
            onDrillIn={onDrillIn}
            onLeafClick={onLeafClick}
          />
        ))}

      {/* "+N more" indicator when children are capped */}
      {!isBackground && hiddenCount > 0 && isFocused && (
        <Html
          position={[position[0], position[1] - radius - 1.2, position[2]]}
          center
          distanceFactor={20}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color: node.color,
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(0,0,0,0.6)",
              padding: "2px 8px",
              borderRadius: 4,
              border: `1px solid ${node.color}40`,
              whiteSpace: "nowrap",
            }}
          >
            +{hiddenCount} more
          </div>
        </Html>
      )}
    </group>
  );
}

// --- Moon sub-component ---

interface MoonOrbProps {
  child: OrbNode;
  parentPosition: [number, number, number];
  parentColor: string;
  orbitRadius: number;
  moonSize: number;
  index: number;
  total: number;
  phaseOffset: number;
  isFocused: boolean;
  onDrillIn: (node: OrbNode) => void;
  onLeafClick: (node: OrbNode) => void;
}

function MoonOrb({
  child,
  parentPosition,
  parentColor,
  orbitRadius,
  moonSize,
  index,
  total,
  phaseOffset,
  isFocused,
  onDrillIn,
  onLeafClick,
}: MoonOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);

  // Stagger delay: each moon fades in 0.15s after the previous
  const staggerDelay = index * 0.15;

  const phase = (Math.PI * 2 * index) / total;
  const speed = 0.2 + index * 0.05;

  // Static position (when focused / frozen)
  const staticPos = useMemo((): [number, number, number] => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return [
      parentPosition[0] + Math.cos(angle) * orbitRadius,
      parentPosition[1],
      parentPosition[2] + Math.sin(angle) * orbitRadius,
    ];
  }, [index, total, parentPosition, orbitRadius]);

  const moonColor = useMemo(() => {
    return new THREE.Color(child.color || parentColor).lerp(
      new THREE.Color(0xffffff),
      0.3,
    );
  }, [child.color, parentColor]);

  const moonColorHex = moonColor.getHex();

  // Size: moons are bigger when parent is focused (clickable)
  const effectiveSize = isFocused ? moonSize * 1.8 : moonSize;

  // Track fade-in and freeze transition
  const fadeRef = useRef(0); // 0 = invisible, 1 = fully visible
  const freezeRef = useRef(isFocused ? 1 : 0); // 0 = orbiting, 1 = frozen

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const mesh = meshRef.current;
    if (!mesh) return;

    // Staggered fade-in: start after staggerDelay seconds
    const targetFade = t > staggerDelay ? 1 : 0;
    fadeRef.current = THREE.MathUtils.lerp(
      fadeRef.current,
      targetFade,
      delta * 4,
    );

    // Freeze transition: lerp towards frozen (1) or orbiting (0)
    const targetFreeze = isFocused ? 1 : 0;
    freezeRef.current = THREE.MathUtils.lerp(
      freezeRef.current,
      targetFreeze,
      delta * 5,
    );
    const freeze = freezeRef.current;

    // Orbiting position
    const angle = t * speed + phase;
    const parentY = parentPosition[1] + Math.sin(t * 0.6 + phaseOffset) * 0.5;
    const orbitX = parentPosition[0] + Math.cos(angle) * orbitRadius;
    const orbitY = parentY + Math.sin(angle * 0.3) * 0.3;
    const orbitZ = parentPosition[2] + Math.sin(angle) * orbitRadius;

    // Blend between orbiting and static
    mesh.position.set(
      THREE.MathUtils.lerp(orbitX, staticPos[0], freeze),
      THREE.MathUtils.lerp(orbitY, staticPos[1], freeze),
      THREE.MathUtils.lerp(orbitZ, staticPos[2], freeze),
    );

    // Apply fade via scale (0 → effectiveSize)
    const s = fadeRef.current * effectiveSize;
    mesh.scale.setScalar(s / effectiveSize || 0.001);

    // Update line endpoint
    if (lineRef.current && lineRef.current.geometry) {
      const positions = lineRef.current.geometry.attributes.position;
      if (positions) {
        const lineParentY = THREE.MathUtils.lerp(
          parentY,
          parentPosition[1],
          freeze,
        );
        positions.setXYZ(0, parentPosition[0], lineParentY, parentPosition[2]);
        positions.setXYZ(1, mesh.position.x, mesh.position.y, mesh.position.z);
        positions.needsUpdate = true;
      }
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!isFocused) return;
    if (isLeafType(child.type)) {
      onLeafClick(child);
    } else {
      onDrillIn(child);
    }
  };

  return (
    <>
      {/* Connection line */}
      <Line
        ref={lineRef}
        points={[parentPosition, parentPosition]}
        color={child.color || parentColor}
        lineWidth={1}
        transparent
        opacity={isFocused ? 0.25 : 0.08}
      />

      {/* Moon sphere */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={(e) => {
          if (!isFocused) return;
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry
          args={[effectiveSize, isFocused ? 16 : 8, isFocused ? 16 : 8]}
        />
        <meshStandardMaterial
          color={moonColorHex}
          emissive={moonColorHex}
          emissiveIntensity={hovered ? 0.9 : 0.5}
          metalness={0.3}
          roughness={0.4}
        />

        {/* Moon glow */}
        {isFocused ? (
          <mesh>
            <sphereGeometry args={[effectiveSize * 1.3, 12, 12]} />
            <meshBasicMaterial
              color={moonColorHex}
              transparent
              opacity={hovered ? 0.15 : 0.06}
              side={THREE.BackSide}
            />
          </mesh>
        ) : null}

        {/* Moon label (only when parent is focused) */}
        {isFocused ? (
          <Html
            position={[0, effectiveSize + 0.6, 0]}
            center
            distanceFactor={20}
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                color: "white",
                fontSize: "11px",
                fontWeight: 500,
                textShadow: `0 0 8px ${child.color || parentColor}, 0 0 3px rgba(0,0,0,0.8)`,
                whiteSpace: "nowrap",
                opacity: hovered ? 1 : 0.5,
                transition: "opacity 0.2s",
              }}
            >
              {child.label}
            </div>
          </Html>
        ) : null}
      </mesh>
    </>
  );
}
