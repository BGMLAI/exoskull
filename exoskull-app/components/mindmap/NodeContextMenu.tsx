"use client";

/**
 * NodeContextMenu — Right-click context menu for mind map nodes.
 * Actions: expand/collapse, change visual type, attach model, view details.
 */

import { useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Image,
  Box,
  CreditCard,
  Circle,
  Eye,
  Trash2,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";
import type { NodeVisualType } from "@/lib/types/orb-types";

interface NodeContextMenuProps {
  node: MindMapNode;
  x: number;
  y: number;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: (nodeId: string) => void;
  onChangeVisual: (nodeId: string, visualType: NodeVisualType) => void;
  onOpenModelPicker: (nodeId: string) => void;
  onViewDetails: (node: MindMapNode) => void;
}

export function NodeContextMenu({
  node,
  x,
  y,
  isExpanded,
  onClose,
  onToggleExpand,
  onChangeVisual,
  onOpenModelPicker,
  onViewDetails,
}: NodeContextMenuProps) {
  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  const visualTypes: {
    type: NodeVisualType;
    label: string;
    icon: React.ElementType;
  }[] = [
    { type: "orb", label: "Orb", icon: Circle },
    { type: "image", label: "Obraz", icon: Image },
    { type: "model3d", label: "Model 3D", icon: Box },
    { type: "card", label: "Karta", icon: CreditCard },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-[61] min-w-[180px] bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl shadow-black/50 py-1 font-mono text-xs"
        style={{ left: x, top: y }}
      >
        {/* Node title */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="text-[10px] text-primary uppercase tracking-wider">
            {node.type}
          </div>
          <div className="text-sm text-foreground truncate">{node.name}</div>
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => handleAction(() => onToggleExpand(node.id))}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {isExpanded ? "Zwin" : "Rozwin"} potomkow
        </button>

        {/* View details */}
        <button
          onClick={() => handleAction(() => onViewDetails(node))}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Szczegoly
        </button>

        {/* Separator */}
        <div className="border-t border-border/50 my-1" />

        {/* Change visual type */}
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
          Zmien wizualizacje
        </div>
        {visualTypes.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => handleAction(() => onChangeVisual(node.id, type))}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 hover:bg-primary/10 transition-colors",
              node.visualType === type
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {node.visualType === type && (
              <span className="ml-auto text-[9px] text-primary">aktywne</span>
            )}
          </button>
        ))}

        {/* Separator */}
        <div className="border-t border-border/50 my-1" />

        {/* Attach 3D model */}
        <button
          onClick={() => handleAction(() => onOpenModelPicker(node.id))}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Dolacz model 3D
        </button>
      </div>
    </>
  );
}
