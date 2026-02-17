/**
 * Graph Converter — transforms recursive OrbNode[] tree into flat graph data
 * for react-force-graph-3d consumption.
 */

import type {
  OrbNode,
  OrbNodeType,
  NodeVisualType,
} from "@/lib/types/orb-types";
import { STATUS_COLORS } from "@/lib/types/orb-types";

export interface MindMapNode {
  id: string;
  name: string;
  type: OrbNodeType;
  visualType: NodeVisualType;
  color: string;
  val: number;
  status?: string;
  imageUrl?: string;
  modelUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  progress?: number;
  tags?: string[];
  depth: number;
  parentId?: string;
}

export interface MindMapLink {
  source: string;
  target: string;
  color?: string;
}

export interface GraphData {
  nodes: MindMapNode[];
  links: MindMapLink[];
}

/** Node size by hierarchy level */
const NODE_SIZES: Record<OrbNodeType, number> = {
  value: 14,
  loop: 10,
  quest: 7,
  mission: 5,
  challenge: 4,
  op: 3,
};

/**
 * Convert OrbNode tree → flat { nodes, links } for force graph.
 * Only expands nodes that are in the expandedNodes set.
 */
export function convertOrbTreeToGraph(
  roots: OrbNode[],
  expandedNodes: Set<string>,
): GraphData {
  const nodes: MindMapNode[] = [];
  const links: MindMapLink[] = [];

  function traverse(node: OrbNode, depth: number, parentId?: string) {
    const mapNode: MindMapNode = {
      id: node.id,
      name: node.label,
      type: node.type,
      visualType: node.visualType || "orb",
      color: node.status
        ? STATUS_COLORS[node.status] || node.color
        : node.color,
      val: NODE_SIZES[node.type] || 5,
      status: node.status,
      imageUrl: node.imageUrl,
      modelUrl: node.modelUrl,
      thumbnailUrl: node.thumbnailUrl,
      description: node.description,
      progress: node.progress,
      tags: node.tags,
      depth,
      parentId,
    };

    nodes.push(mapNode);

    if (parentId) {
      links.push({
        source: parentId,
        target: node.id,
        color: `${node.color}40`,
      });
    }

    // Only expand children if node is in expandedNodes set
    if (expandedNodes.has(node.id) && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child, depth + 1, node.id);
      }
    }
  }

  for (const root of roots) {
    traverse(root, 0);
  }

  return { nodes, links };
}

/**
 * Find a node in the OrbNode tree by ID.
 */
export function findNodeInTree(roots: OrbNode[], id: string): OrbNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    if (root.children.length > 0) {
      const found = findNodeInTree(root.children, id);
      if (found) return found;
    }
  }
  return null;
}
