/**
 * Recursive OrbNode — one type for all hierarchy levels.
 * value → loop → quest → mission → challenge → op
 */
export type OrbNodeType =
  | "value"
  | "loop"
  | "quest"
  | "mission"
  | "challenge"
  | "op";

export interface OrbNode {
  id: string;
  label: string;
  color: string;
  type: OrbNodeType;
  status?: string;
  children: OrbNode[];
  childrenLoaded: boolean;
  meta?: Record<string, unknown>;
  /** Extra fields for tree display */
  description?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high" | "critical";
  progress?: number; // 0-100
  /** Image URL for rich media display (thumbnail in tree, texture on orb) */
  imageUrl?: string;
}

/** Human-readable labels per type */
export const TYPE_LABELS: Record<OrbNodeType, string> = {
  value: "Wartość",
  loop: "Loop",
  quest: "Quest",
  mission: "Misja",
  challenge: "Wyzwanie",
  op: "Zadanie",
};

/** Status color mapping */
export const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  pending: "#f59e0b",
  done: "#6b7280",
  blocked: "#ef4444",
  "in-progress": "#3b82f6",
};

/** Nav stack entry — represents a drill-in step */
export interface NavStackEntry {
  id: string;
  type: string;
  label: string;
}

/** Hierarchy depth mapping */
export const CHILD_TYPE_MAP: Record<string, OrbNodeType | undefined> = {
  value: "loop",
  loop: "quest",
  quest: "mission",
  mission: "challenge",
  challenge: "op",
};

/** Check if a node is a leaf (no further children possible) */
export function isLeafType(type: OrbNodeType): boolean {
  return type === "op";
}
