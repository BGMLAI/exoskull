"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Heart,
  CheckSquare,
  Calendar,
  MessageSquare,
  Brain,
  Shield,
  Zap,
  Link,
  Mail,
  BookOpen,
  Bot,
  Package,
} from "lucide-react";
import { getAvailableWidgetTypes } from "@/lib/canvas/widget-registry";
import type { WidgetMeta } from "@/lib/canvas/types";

// ============================================================================
// ICON RESOLVER
// ============================================================================

const ICON_MAP: Record<string, React.ElementType> = {
  Heart,
  CheckSquare,
  Calendar,
  MessageSquare,
  Brain,
  Shield,
  Zap,
  Link,
  Mail,
  BookOpen,
  Bot,
  Package,
};

function getIcon(name: string) {
  return ICON_MAP[name] || Package;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface WidgetPickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (widgetType: string) => void;
  existingTypes: string[];
}

export function WidgetPicker({
  open,
  onClose,
  onAdd,
  existingTypes,
}: WidgetPickerProps) {
  const available = getAvailableWidgetTypes();

  const categories = [
    { key: "core", label: "Podstawowe" },
    { key: "health", label: "Zdrowie" },
    { key: "productivity", label: "Produktywnosc" },
    { key: "iors", label: "IORS" },
  ];

  const handleAdd = (meta: WidgetMeta) => {
    onAdd(meta.type);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj widget</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {categories.map((cat) => {
            const widgets = available.filter((w) => w.category === cat.key);
            if (widgets.length === 0) return null;

            return (
              <div key={cat.key}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {cat.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {widgets.map((meta) => {
                    const Icon = getIcon(meta.icon);
                    const alreadyAdded = existingTypes.includes(meta.type);

                    return (
                      <button
                        key={meta.type}
                        onClick={() => !alreadyAdded && handleAdd(meta)}
                        disabled={alreadyAdded}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-colors ${
                          alreadyAdded
                            ? "opacity-40 cursor-not-allowed bg-muted"
                            : "hover:bg-accent cursor-pointer"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{meta.label}</span>
                        {alreadyAdded && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            dodany
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
