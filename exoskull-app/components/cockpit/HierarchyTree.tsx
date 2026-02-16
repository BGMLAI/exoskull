"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { OrbNode, OrbNodeType } from "@/lib/types/orb-types";
import { TYPE_LABELS, STATUS_COLORS, isLeafType } from "@/lib/types/orb-types";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";

interface HierarchyTreeProps {
  nodes: OrbNode[];
  parentLabel: string;
  parentColor: string;
  onLoadChildren?: (nodeId: string) => void;
}

/** Indent size per depth level */
const INDENT_PX = 20;

/** Type-to-icon color */
const TYPE_COLORS: Record<OrbNodeType, string> = {
  value: "#10b981",
  loop: "#06b6d4",
  quest: "#3b82f6",
  mission: "#8b5cf6",
  challenge: "#f59e0b",
  op: "#f472b6",
};

/**
 * HierarchyTree — Collapsible 2D tree for deeper hierarchy levels.
 * Shows Quest > Mission > Challenge > Op with status, dates, progress.
 * Cyberpunk HUD style matching the cockpit aesthetic.
 */
export function HierarchyTree({
  nodes,
  parentLabel,
  parentColor,
  onLoadChildren,
}: HierarchyTreeProps) {
  const openPreview = useCockpitStore((s) => s.openPreview);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "12px 16px",
        fontFamily: "monospace",
        fontSize: "12px",
        color: "rgba(255, 255, 255, 0.85)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: `1px solid ${parentColor}30`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: parentColor,
            boxShadow: `0 0 8px ${parentColor}80`,
          }}
        />
        <span style={{ color: parentColor, fontWeight: 700, fontSize: "14px" }}>
          {parentLabel}
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>
          {nodes.length} {nodes.length === 1 ? "element" : "elementów"}
        </span>
      </div>

      {/* Tree nodes */}
      {nodes.length === 0 ? (
        <div
          style={{
            color: "rgba(255,255,255,0.3)",
            padding: "20px 0",
            textAlign: "center",
          }}
        >
          Brak elementów
        </div>
      ) : (
        nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            onLoadChildren={onLoadChildren}
            onLeafClick={(n) => {
              openPreview({
                type: "value",
                id: n.id,
                title: n.label,
                data: {
                  nodeType: n.type,
                  status: n.status,
                  description: n.description,
                  dueDate: n.dueDate,
                  priority: n.priority,
                  progress: n.progress,
                  imageUrl: n.imageUrl,
                },
              });
            }}
          />
        ))
      )}
    </div>
  );
}

// --- TreeNode recursive component ---

interface TreeNodeProps {
  node: OrbNode;
  depth: number;
  onLoadChildren?: (nodeId: string) => void;
  onLeafClick: (node: OrbNode) => void;
}

function TreeNode({ node, depth, onLoadChildren, onLeafClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1); // auto-expand first level
  const hasChildren =
    node.children.length > 0 ||
    (!node.childrenLoaded && !isLeafType(node.type));
  const isLeaf =
    isLeafType(node.type) ||
    (node.childrenLoaded && node.children.length === 0);

  const typeColor = TYPE_COLORS[node.type] || "#888";
  const statusColor =
    STATUS_COLORS[node.status || ""] || "rgba(255,255,255,0.3)";

  const handleToggle = useCallback(() => {
    if (isLeaf) {
      onLeafClick(node);
      return;
    }
    if (!node.childrenLoaded && onLoadChildren) {
      onLoadChildren(node.id);
    }
    setExpanded((v) => !v);
  }, [isLeaf, node, onLoadChildren, onLeafClick]);

  return (
    <div>
      {/* Node row */}
      <div
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 4px",
          paddingLeft: depth * INDENT_PX + 4,
          cursor: "pointer",
          borderRadius: 4,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Expand/collapse chevron */}
        {!isLeaf ? (
          expanded ? (
            <ChevronDown
              size={14}
              style={{ color: typeColor, flexShrink: 0 }}
            />
          ) : (
            <ChevronRight
              size={14}
              style={{ color: typeColor, flexShrink: 0 }}
            />
          )
        ) : (
          <div style={{ width: 14, flexShrink: 0 }} />
        )}

        {/* Thumbnail */}
        {node.imageUrl && (
          <img
            src={node.imageUrl}
            alt=""
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              objectFit: "cover",
              border: `1px solid ${typeColor}40`,
              flexShrink: 0,
            }}
          />
        )}

        {/* Status icon */}
        <StatusIcon status={node.status} color={statusColor} />

        {/* Type badge */}
        <span
          style={{
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: typeColor,
            background: `${typeColor}15`,
            border: `1px solid ${typeColor}30`,
            borderRadius: 3,
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          {TYPE_LABELS[node.type]}
        </span>

        {/* Label */}
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color:
              node.status === "done"
                ? "rgba(255,255,255,0.35)"
                : "rgba(255,255,255,0.85)",
            textDecoration: node.status === "done" ? "line-through" : "none",
          }}
        >
          {node.label}
        </span>

        {/* Priority badge */}
        {node.priority && node.priority !== "medium" && (
          <PriorityBadge priority={node.priority} />
        )}

        {/* Progress bar */}
        {node.progress !== undefined && node.progress > 0 && (
          <ProgressMini value={node.progress} color={typeColor} />
        )}

        {/* Due date */}
        {node.dueDate && (
          <span
            style={{
              fontSize: "10px",
              color: isOverdue(node.dueDate)
                ? "#ef4444"
                : "rgba(255,255,255,0.35)",
              flexShrink: 0,
            }}
          >
            {formatDate(node.dueDate)}
          </span>
        )}

        {/* Children count */}
        {hasChildren && node.children.length > 0 && (
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.25)",
              flexShrink: 0,
            }}
          >
            ({node.children.length})
          </span>
        )}
      </div>

      {/* Description (when expanded, if present) */}
      {expanded && node.description && (
        <div
          style={{
            paddingLeft: depth * INDENT_PX + 38,
            paddingBottom: 4,
            fontSize: "11px",
            color: "rgba(255,255,255,0.3)",
            lineHeight: 1.4,
          }}
        >
          {node.description}
        </div>
      )}

      {/* Children */}
      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onLoadChildren={onLoadChildren}
            onLeafClick={onLeafClick}
          />
        ))}
    </div>
  );
}

// --- Small sub-components ---

function StatusIcon({ status, color }: { status?: string; color: string }) {
  const size = 12;
  switch (status) {
    case "done":
      return <CheckCircle2 size={size} style={{ color, flexShrink: 0 }} />;
    case "active":
    case "in-progress":
      return <Clock size={size} style={{ color, flexShrink: 0 }} />;
    case "blocked":
      return <AlertTriangle size={size} style={{ color, flexShrink: 0 }} />;
    default:
      return <Circle size={size} style={{ color, flexShrink: 0 }} />;
  }
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "#6b7280",
    high: "#f59e0b",
    critical: "#ef4444",
  };
  const c = colors[priority] || "#6b7280";
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: 600,
        color: c,
        background: `${c}15`,
        border: `1px solid ${c}30`,
        borderRadius: 3,
        padding: "0 4px",
        flexShrink: 0,
      }}
    >
      {priority === "critical" ? "!!!" : priority === "high" ? "!!" : priority}
    </span>
  );
}

function ProgressMini({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 4,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: color,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, "0");
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${day}.${mon}`;
  } catch {
    return dateStr;
  }
}

function isOverdue(dateStr: string): boolean {
  try {
    return new Date(dateStr) < new Date();
  } catch {
    return false;
  }
}
