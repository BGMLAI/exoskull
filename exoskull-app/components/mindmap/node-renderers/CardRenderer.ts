/**
 * CardRenderer — creates a canvas-rendered info card for mind map nodes.
 */

import * as THREE from "three";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

const FALLBACK_COLOR = "#888888";
const MIN_SCALE = 2;

export function createCardObject(node: MindMapNode): THREE.Object3D {
  const group = new THREE.Group();

  try {
    const colorStr = node.color || FALLBACK_COLOR;
    const val = node.val && node.val > 0 ? node.val : 5;
    const scale = Math.max(Math.sqrt(val) * 2.5, MIN_SCALE);

    // Card canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 320;
      canvas.height = 180;

      // Background
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = colorStr;
      ctx.lineWidth = 2;
      const r = 12;
      ctx.beginPath();
      ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, r);
      ctx.fill();
      ctx.stroke();

      // Top accent line
      ctx.fillStyle = colorStr;
      ctx.fillRect(16, 12, 60, 3);

      // Type badge
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = colorStr;
      ctx.fillText(node.type.toUpperCase(), 16, 38);

      // Title
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = "#e2e8f0";
      const title = node.name.slice(0, 28);
      ctx.fillText(title, 16, 62);

      // Description (if available)
      if (node.description) {
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "#94a3b8";
        const desc = node.description.slice(0, 50);
        ctx.fillText(desc, 16, 86);
      }

      // Status indicator
      if (node.status) {
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(node.status, 16, 110);
      }

      // Progress bar (if available)
      if (node.progress !== undefined) {
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(16, 130, 288, 8);
        ctx.fillStyle = colorStr;
        ctx.fillRect(16, 130, 288 * (node.progress / 100), 8);
      }

      // Tags
      if (node.tags && node.tags.length > 0) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(node.tags.slice(0, 3).join(" · "), 16, 158);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(scale * 5, scale * 2.8, 1);
      group.add(sprite);
    }
  } catch (error) {
    console.error("[CardRenderer] Failed:", {
      error: error instanceof Error ? error.message : error,
      nodeId: node.id,
    });
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    const fb = new THREE.Mesh(geo, mat);
    fb.scale.setScalar(4);
    group.add(fb);
  }

  return group;
}
