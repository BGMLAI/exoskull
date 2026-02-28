"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { IorsState } from "@/lib/hooks/useChatEngine";

// ---------------------------------------------------------------------------
// State → visual parameters
// ---------------------------------------------------------------------------

interface OrbParams {
  color: string;
  emissive: string;
  pulseSpeed: number;
  pulseAmplitude: number;
  noiseScale: number;
  rotationSpeed: number;
  particleCount: number;
}

const STATE_PARAMS: Record<IorsState, OrbParams> = {
  idle: {
    color: "#3b82f6",
    emissive: "#1d4ed8",
    pulseSpeed: 1.2,
    pulseAmplitude: 0.05,
    noiseScale: 0.3,
    rotationSpeed: 0.1,
    particleCount: 20,
  },
  thinking: {
    color: "#8b5cf6",
    emissive: "#6d28d9",
    pulseSpeed: 2.5,
    pulseAmplitude: 0.08,
    noiseScale: 0.6,
    rotationSpeed: 0.3,
    particleCount: 40,
  },
  speaking: {
    color: "#10b981",
    emissive: "#059669",
    pulseSpeed: 1.8,
    pulseAmplitude: 0.1,
    noiseScale: 0.4,
    rotationSpeed: 0.15,
    particleCount: 30,
  },
  building: {
    color: "#f59e0b",
    emissive: "#d97706",
    pulseSpeed: 3.0,
    pulseAmplitude: 0.12,
    noiseScale: 0.8,
    rotationSpeed: 0.5,
    particleCount: 60,
  },
  listening: {
    color: "#06b6d4",
    emissive: "#0891b2",
    pulseSpeed: 1.5,
    pulseAmplitude: 0.15,
    noiseScale: 0.35,
    rotationSpeed: 0.12,
    particleCount: 25,
  },
};

// ---------------------------------------------------------------------------
// Custom shader material
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uPulseSpeed;
  uniform float uPulseAmplitude;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simple 3D noise (hash-based)
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    // Noise displacement
    float n = noise(position * 2.0 + uTime * 0.5) * uNoiseScale;

    // Pulse
    float pulse = sin(uTime * uPulseSpeed) * uPulseAmplitude;

    vDisplacement = n + pulse;
    vec3 displaced = position + normal * vDisplacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    // Fresnel glow
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);

    // Mix base color with emissive based on displacement
    vec3 color = mix(uColor, uEmissive, vDisplacement * 2.0 + 0.3);

    // Add Fresnel edge glow
    color += fresnel * uEmissive * 1.5;

    // Subtle shimmer
    float shimmer = sin(vPosition.y * 10.0 + uTime * 2.0) * 0.05 + 0.95;
    color *= shimmer;

    gl_FragColor = vec4(color, 0.92 - fresnel * 0.1);
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IORSOrbProps {
  iorsState: IorsState;
  audioLevel?: number;
}

export function IORSOrb({ iorsState, audioLevel = 0 }: IORSOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const params = STATE_PARAMS[iorsState];

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(params.color) },
      uEmissive: { value: new THREE.Color(params.emissive) },
      uNoiseScale: { value: params.noiseScale },
      uPulseSpeed: { value: params.pulseSpeed },
      uPulseAmplitude: { value: params.pulseAmplitude },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!materialRef.current || !meshRef.current) return;

    const u = materialRef.current.uniforms;
    u.uTime.value += delta;

    // Smoothly lerp colors and params
    const targetColor = new THREE.Color(params.color);
    const targetEmissive = new THREE.Color(params.emissive);
    u.uColor.value.lerp(targetColor, delta * 2);
    u.uEmissive.value.lerp(targetEmissive, delta * 2);
    u.uNoiseScale.value +=
      (params.noiseScale - u.uNoiseScale.value) * delta * 3;
    u.uPulseSpeed.value +=
      (params.pulseSpeed - u.uPulseSpeed.value) * delta * 3;
    u.uPulseAmplitude.value +=
      (params.pulseAmplitude - u.uPulseAmplitude.value) * delta * 3;

    // Float animation
    meshRef.current.position.y = 2 + Math.sin(u.uTime.value * 0.8) * 0.15;

    // Rotation
    meshRef.current.rotation.y += params.rotationSpeed * delta;

    // Audio-reactive scale (listening mode)
    if (iorsState === "listening" && audioLevel > 0) {
      const scale = 1 + audioLevel * 0.3;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 2, 0]}>
        <icosahedronGeometry args={[1.2, 6]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
        />
      </mesh>

      {/* Sparkles around the orb */}
      <Sparkles
        count={params.particleCount}
        scale={4}
        size={2}
        speed={params.pulseSpeed * 0.5}
        color={params.color}
        position={[0, 2, 0]}
      />

      {/* Glow halo (additive blended sphere) */}
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[1.6, 16, 16]} />
        <meshBasicMaterial
          color={params.emissive}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}
