/**
 * ImageRenderer — creates a billboard plane with texture for image nodes.
 */

import * as THREE from "three";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function getTexture(url: string): THREE.Texture {
  if (textureCache.has(url)) return textureCache.get(url)!;
  const tex = textureLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(url, tex);
  return tex;
}

const FALLBACK_COLOR = "#888888";
const MIN_SCALE = 2;

export function createImageObject(node: MindMapNode): THREE.Object3D {
  const group = new THREE.Group();

  try {
    const colorStr = node.color || FALLBACK_COLOR;
    const val = node.val && node.val > 0 ? node.val : 5;
    const scale = Math.max(Math.sqrt(val) * 2.5, MIN_SCALE);
    const imgUrl = node.imageUrl || node.thumbnailUrl;

    if (imgUrl) {
      const texture = getTexture(imgUrl);
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(scale * 2.5, scale * 2.5, 1);
      group.add(sprite);

      // Border frame
      const borderGeo = new THREE.RingGeometry(scale * 1.3, scale * 1.4, 4);
      const borderMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorStr),
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.rotation.z = Math.PI / 4;
      group.add(border);
    } else {
      // Fallback to colored sphere
      const geo = new THREE.SphereGeometry(1, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorStr),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(scale);
      group.add(mesh);
    }

    // Label
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 512;
      canvas.height = 128;
      ctx.clearRect(0, 0, 512, 128);
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillText(node.name.slice(0, 25), 258, 66);
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
      const labelSprite = new THREE.Sprite(spriteMat);
      labelSprite.scale.set(scale * 5, scale * 1.25, 1);
      labelSprite.position.y = scale * 2.2;
      group.add(labelSprite);
    }
  } catch (error) {
    console.error("[ImageRenderer] Failed:", {
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
