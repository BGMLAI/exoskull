/**
 * ModelRenderer — loads and displays glTF/GLB 3D models for mind map nodes.
 * Includes cache with LRU eviction (max 50 models).
 */

import * as THREE from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

const loader = new GLTFLoader();
const modelCache = new Map<string, GLTF>();
const MAX_CACHE_SIZE = 50;

function evictOldest() {
  if (modelCache.size >= MAX_CACHE_SIZE) {
    const firstKey = modelCache.keys().next().value;
    if (firstKey) {
      const gltf = modelCache.get(firstKey);
      if (gltf) {
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }
      modelCache.delete(firstKey);
    }
  }
}

export function createModelObject(node: MindMapNode): THREE.Object3D {
  const group = new THREE.Group();
  const scale = Math.sqrt(node.val) * 2.5;

  if (node.modelUrl) {
    // Check cache first
    if (modelCache.has(node.modelUrl)) {
      const cached = modelCache.get(node.modelUrl)!;
      const clone = cached.scene.clone(true);
      // Normalize model size
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const normScale = (scale * 2) / (maxDim || 1);
      clone.scale.setScalar(normScale);
      group.add(clone);
    } else {
      // Placeholder while loading
      const geo = new THREE.OctahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        wireframe: true,
        emissive: new THREE.Color(node.color),
        emissiveIntensity: 0.3,
      });
      const placeholder = new THREE.Mesh(geo, mat);
      placeholder.scale.setScalar(scale);
      placeholder.name = "__placeholder";
      group.add(placeholder);

      // Async load
      loader.load(
        node.modelUrl,
        (gltf) => {
          evictOldest();
          modelCache.set(node.modelUrl!, gltf);

          // Remove placeholder
          const ph = group.getObjectByName("__placeholder");
          if (ph) group.remove(ph);

          const clone = gltf.scene.clone(true);
          const box = new THREE.Box3().setFromObject(clone);
          const sz = box.getSize(new THREE.Vector3());
          const maxD = Math.max(sz.x, sz.y, sz.z);
          const normS = (scale * 2) / (maxD || 1);
          clone.scale.setScalar(normS);
          group.add(clone);
        },
        undefined,
        (err) => {
          console.error("[ModelRenderer] Failed to load:", node.modelUrl, err);
        },
      );
    }
  } else {
    // No model URL — diamond placeholder
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.color),
      emissive: new THREE.Color(node.color),
      emissiveIntensity: 0.4,
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
