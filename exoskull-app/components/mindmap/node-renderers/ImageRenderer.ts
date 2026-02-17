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

export function createImageObject(node: MindMapNode): THREE.Object3D {
  const group = new THREE.Group();
  const scale = Math.sqrt(node.val) * 2.5;
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
      color: new THREE.Color(node.color),
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.z = Math.PI / 4;
    group.add(border);
  } else {
    // Fallback to colored sphere if no image
    const geo = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.color),
      emissive: new THREE.Color(node.color),
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);
    group.add(mesh);
  }

  // Label
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    canvas.width = 256;
    canvas.height = 64;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = node.color;
    ctx.shadowBlur = 6;
    ctx.fillText(node.name.slice(0, 25), 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const labelSprite = new THREE.Sprite(spriteMat);
    labelSprite.scale.set(scale * 4, scale * 1, 1);
    labelSprite.position.y = scale * 2.2;
    group.add(labelSprite);
  }

  return group;
}
