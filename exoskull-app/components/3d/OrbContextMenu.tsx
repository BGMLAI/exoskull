"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { useOrbData } from "@/lib/hooks/useOrbData";
import { CHILD_TYPE_MAP, TYPE_LABELS } from "@/lib/types/orb-types";
import type { OrbNode, OrbNodeType } from "@/lib/types/orb-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── Context Menu Item ───

interface OrbContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

interface OrbContextMenuProps {
  x: number;
  y: number;
  items: OrbContextMenuItem[];
  onClose: () => void;
}

function OrbContextMenu({ x, y, items, onClose }: OrbContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so menu doesn't go off-screen
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const newX = x + rect.width > window.innerWidth ? x - rect.width : x;
    const newY = y + rect.height > window.innerHeight ? y - rect.height : y;
    setAdjustedPos({
      x: Math.max(4, newX),
      y: Math.max(4, newY),
    });
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the initial right-click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Close on scroll
  useEffect(() => {
    const handleScroll = () => onClose();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 200,
        background: "rgba(10, 10, 28, 0.95)",
        border: "1px solid rgba(6, 182, 212, 0.2)",
        borderRadius: 8,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 1px rgba(6, 182, 212, 0.3)",
        padding: "4px 0",
        minWidth: 180,
        overflow: "hidden",
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 14px",
            background: "transparent",
            border: "none",
            color: item.danger ? "#ef4444" : "rgba(255, 255, 255, 0.9)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = item.danger
              ? "rgba(239, 68, 68, 0.1)"
              : "rgba(6, 182, 212, 0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          {item.icon && <span style={{ fontSize: 15 }}>{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── OrbFormDialog (inline, for creating/editing orb nodes) ───

const COLOR_OPTIONS = [
  "#10B981",
  "#3B82F6",
  "#EC4899",
  "#F59E0B",
  "#8B5CF6",
  "#F472B6",
  "#22D3EE",
  "#EF4444",
  "#84CC16",
];

interface OrbFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  node?: OrbNode | null;
  /** For create: the type of node to create */
  createType?: OrbNodeType;
  /** For create: the parent node ID */
  parentId?: string | null;
  onSave: (data: {
    label: string;
    color?: string;
    description?: string;
    priority?: string;
  }) => Promise<void>;
}

function OrbFormDialog({
  open,
  onOpenChange,
  mode,
  node,
  createType,
  onSave,
}: OrbFormDialogProps) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const nodeType = mode === "edit" && node ? node.type : createType || "value";
  const typeLabel = TYPE_LABELS[nodeType] || nodeType;

  useEffect(() => {
    if (mode === "edit" && node) {
      setLabel(node.label);
      setColor(node.color || "#3B82F6");
      setDescription(node.description || "");
      setPriority(node.priority || "medium");
    } else {
      setLabel("");
      setColor("#3B82F6");
      setDescription("");
      setPriority("medium");
    }
  }, [mode, node, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        color,
        description: description.trim() || undefined,
        priority,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[OrbFormDialog] Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `Edytuj ${typeLabel}` : `Nowy ${typeLabel}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? `Edycja elementu: ${node?.label || ""}`
              : `Tworzenie nowego elementu typu ${typeLabel}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="orb-label">Nazwa</Label>
              <Input
                id="orb-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Nazwa ${typeLabel.toLowerCase()}...`}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="orb-desc">Opis</Label>
              <Textarea
                id="orb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Krotki opis..."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Kolor</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      color === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="orb-priority">Priorytet</Label>
              <select
                id="orb-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="low">Niski</option>
                <option value="medium">Sredni</option>
                <option value="high">Wysoki</option>
                <option value="critical">Krytyczny</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={saving || !label.trim()}>
              {saving
                ? "Zapisywanie..."
                : mode === "edit"
                  ? "Zapisz"
                  : "Utworz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── OrbDeleteConfirm ───

interface OrbDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: OrbNode | null;
  onConfirm: () => Promise<void>;
}

function OrbDeleteConfirm({
  open,
  onOpenChange,
  node,
  onConfirm,
}: OrbDeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("[OrbDeleteConfirm] Delete error:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (!node) return null;

  const typeLabel = TYPE_LABELS[node.type] || node.type;
  const childCount = node.children.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Usunac {typeLabel.toLowerCase()}: &quot;{node.label}&quot;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ta operacja jest nieodwracalna.
            {childCount > 0 &&
              ` Ten element posiada ${childCount} ${childCount === 1 ? "dziecko" : "dzieci"}, ktore rowniez zostana usuniete.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Usuwanie..." : "Usun"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── OrbContextMenuOverlay (rendered in CyberpunkDashboard, outside Canvas) ───

export function OrbContextMenuOverlay() {
  const orbContextMenu = useCockpitStore((s) => s.orbContextMenu);
  const setOrbContextMenu = useCockpitStore((s) => s.setOrbContextMenu);
  const { addNode, removeNode, updateNode } = useOrbData();

  // Dialog states
  const [formDialog, setFormDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    node: OrbNode | null;
    createType: OrbNodeType;
    parentId: string | null;
  }>({
    open: false,
    mode: "create",
    node: null,
    createType: "value",
    parentId: null,
  });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    node: OrbNode | null;
  }>({
    open: false,
    node: null,
  });

  const handleClose = useCallback(() => {
    setOrbContextMenu(null);
  }, [setOrbContextMenu]);

  // Prevent default browser context menu on the canvas area
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Only prevent if right-clicking on the canvas or if our menu is open
      const target = e.target as HTMLElement;
      if (target.tagName === "CANVAS" || orbContextMenu) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [orbContextMenu]);

  const handleFormSave = async (data: {
    label: string;
    color?: string;
    description?: string;
    priority?: string;
  }) => {
    if (formDialog.mode === "create") {
      const success = await addNode(
        formDialog.parentId,
        formDialog.createType,
        data,
      );
      if (!success) {
        throw new Error("Nie udalo sie utworzyc elementu");
      }
    } else if (formDialog.mode === "edit" && formDialog.node) {
      const success = await updateNode(
        formDialog.node.id,
        formDialog.node.type,
        data,
      );
      if (!success) {
        throw new Error("Nie udalo sie zaktualizowac elementu");
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.node) return;
    const success = await removeNode(
      deleteDialog.node.id,
      deleteDialog.node.type,
    );
    if (!success) {
      throw new Error("Nie udalo sie usunac elementu");
    }
  };

  // Build menu items based on context
  const buildMenuItems = (): OrbContextMenuItem[] => {
    if (!orbContextMenu) return [];

    const { node, depth } = orbContextMenu;

    if (node) {
      // Right-clicked on an orb node
      const items: OrbContextMenuItem[] = [];

      // "Add child" — only if node type can have children
      const childType = CHILD_TYPE_MAP[node.type];
      if (childType) {
        const childLabel = TYPE_LABELS[childType] || childType;
        items.push({
          label: `Dodaj ${childLabel.toLowerCase()}`,
          icon: "\u2795",
          onClick: () => {
            setFormDialog({
              open: true,
              mode: "create",
              node: null,
              createType: childType,
              parentId: node.id,
            });
          },
        });
      }

      // "Edit"
      items.push({
        label: "Edytuj",
        icon: "\u270F\uFE0F",
        onClick: () => {
          setFormDialog({
            open: true,
            mode: "edit",
            node,
            createType: node.type,
            parentId: null,
          });
        },
      });

      // "Delete"
      items.push({
        label: "Usun",
        icon: "\uD83D\uDDD1\uFE0F",
        danger: true,
        onClick: () => {
          setDeleteDialog({ open: true, node });
        },
      });

      return items;
    } else {
      // Right-clicked on empty space
      // Determine what type to create based on depth
      const depthTypeMap: Record<number, OrbNodeType> = {
        0: "value",
        1: "loop",
        2: "quest",
        3: "mission",
        4: "challenge",
        5: "op",
      };
      const createType = depthTypeMap[depth] || "value";
      const typeLabel = TYPE_LABELS[createType] || createType;

      return [
        {
          label: `Dodaj nowy ${typeLabel.toLowerCase()}`,
          icon: "\u2795",
          onClick: () => {
            setFormDialog({
              open: true,
              mode: "create",
              node: null,
              createType,
              parentId: null,
            });
          },
        },
      ];
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Context menu */}
      {orbContextMenu &&
        createPortal(
          <OrbContextMenu
            x={orbContextMenu.x}
            y={orbContextMenu.y}
            items={buildMenuItems()}
            onClose={handleClose}
          />,
          document.body,
        )}

      {/* Form dialog */}
      <OrbFormDialog
        open={formDialog.open}
        onOpenChange={(open) => setFormDialog((prev) => ({ ...prev, open }))}
        mode={formDialog.mode}
        node={formDialog.node}
        createType={formDialog.createType}
        parentId={formDialog.parentId}
        onSave={handleFormSave}
      />

      {/* Delete confirmation dialog */}
      <OrbDeleteConfirm
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
        node={deleteDialog.node}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
