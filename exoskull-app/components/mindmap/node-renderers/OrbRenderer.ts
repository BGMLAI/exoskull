/**
 * OrbRenderer — creates a glowing sphere THREE.Object3D for mind map nodes.
 * Uses MeshBasicMaterial (self-illuminated, no lights needed) + emissive glow.
 */

import * as THREE from "three";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
const glowGeo = new THREE.SphereGeometry(1.4, 16, 16);

const FALLBACK_COLOR = "#888888";
const MIN_SCALE = 2;

export function createOrbObject(node: MindMapNode): THREE.Object3D {
  const group = new THREE.Group();

  try {
    const colorStr = node.color || FALLBACK_COLOR;
    const color = new THREE.Color(colorStr);
    const val = node.val && node.val > 0 ? node.val : 5;
    const scale = Math.max(Math.sqrt(val) * 2.5, MIN_SCALE);

    // Main sphere — MeshBasicMaterial so it's always visible (no lights needed)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorStr).multiplyScalar(0.7),
    });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.scale.setScalar(scale);
    group.add(mesh);

    // Inner glow (emissive overlay)
    const innerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
    });
    const inner = new THREE.Mesh(sphereGeo, innerMat);
    inner.scale.setScalar(scale * 0.9);
    group.add(inner);

    // Outer glow halo
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.scale.setScalar(scale * 1.3);
    group.add(glow);

    // Label sprite
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 512;
      canvas.height = 128;
      ctx.clearRect(0, 0, 512, 128);

      // Text shadow for readability on dark bg
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Draw shadow
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillText(node.name.slice(0, 25), 258, 66);

      // Draw main text
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = colorStr;
      ctx.shadowBlur = 12;
      ctx.fillText(node.name.slice(0, 25), 256, 64);

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
  } catch (error) {
    console.error("[OrbRenderer] Failed:", {
      error: error instanceof Error ? error.message : error,
      nodeId: node.id,
      color: node.color,
      val: node.val,
    });
    // Fallback: bright colored sphere always visible
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    const fallback = new THREE.Mesh(geo, mat);
    fallback.scale.setScalar(4);
    group.add(fallback);
  }

  return group;
}
