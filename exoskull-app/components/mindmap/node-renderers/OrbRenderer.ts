/**
 * OrbRenderer — creates a glowing sphere THREE.Object3D for mind map nodes.
 * Ported from OrbCluster.tsx sphere + glow halo pattern.
 */

import * as THREE from "three";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
const glowGeo = new THREE.SphereGeometry(1.35, 16, 16);

export function createOrbObject(node: MindMapNode): THREE.Object3D {
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();

  // Main sphere
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(sphereGeo, mat);
  const scale = Math.sqrt(node.val) * 2.5;
  mesh.scale.setScalar(scale);
  group.add(mesh);

  // Glow halo
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.scale.setScalar(scale);
  group.add(glow);

  // Label sprite
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    canvas.width = 512;
    canvas.height = 128;
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = node.color;
    ctx.shadowBlur = 8;
    ctx.fillText(node.name.slice(0, 25), 256, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(scale * 5, scale * 1.25, 1);
    sprite.position.y = scale * 1.8;
    group.add(sprite);
  }

  return group;
}
