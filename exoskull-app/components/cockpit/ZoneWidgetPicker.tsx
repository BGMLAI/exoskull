"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCockpitStore,
  type CockpitZone,
} from "@/lib/stores/useCockpitStore";
import { getAvailableWidgetTypes } from "@/lib/canvas/widget-registry";
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
  Activity,
  TrendingUp,
  Inbox,
  Lightbulb,
  TreePine,
  HeartPulse,
} from "lucide-react";
import type { WidgetMeta } from "@/lib/canvas/types";

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
  Activity,
  TrendingUp,
  Inbox,
  Lightbulb,
  TreePine,
  HeartPulse,
};

function getIcon(name: string) {
  return ICON_MAP[name] || Package;
}

interface ZoneWidgetPickerProps {
  open: boolean;
  onClose: () => void;
  zoneId: CockpitZone;
}

export function ZoneWidgetPicker({
  open,
  onClose,
  zoneId,
}: ZoneWidgetPickerProps) {
  const setZoneWidget = useCockpitStore((s) => s.setZoneWidget);
  const zoneWidgets = useCockpitStore((s) => s.zoneWidgets);
  const available = getAvailableWidgetTypes();

  const categories = [
    { key: "core", label: "Podstawowe" },
    { key: "health", label: "Zdrowie" },
    { key: "productivity", label: "Produktywnosc" },
    { key: "iors", label: "IORS" },
  ];

  const handleSelect = (meta: WidgetMeta) => {
    setZoneWidget(zoneId, meta.type);
    // Persist to backend
    const updated = [
      ...useCockpitStore
        .getState()
        .zoneWidgets.filter((z) => z.zoneId !== zoneId),
      { zoneId, widgetType: meta.type },
    ];
    fetch("/api/settings/cockpit", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_widgets: updated }),
    }).catch((err) => console.error("[ZoneWidgetPicker] Persist failed:", err));
    onClose();
  };

  const usedTypes = zoneWidgets.map((z) => z.widgetType);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Pin widget: {zoneId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {categories.map((cat) => {
            const widgets = available.filter((w) => w.category === cat.key);
            if (widgets.length === 0) return null;

            return (
              <div key={cat.key}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  {cat.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {widgets.map((meta) => {
                    const Icon = getIcon(meta.icon);
                    const alreadyUsed = usedTypes.includes(meta.type);
                    return (
                      <button
                        key={meta.type}
                        onClick={() => !alreadyUsed && handleSelect(meta)}
                        disabled={alreadyUsed}
                        className={`flex items-center gap-2 p-2 rounded-md border text-left text-xs transition-colors ${
                          alreadyUsed
                            ? "opacity-30 cursor-not-allowed bg-muted"
                            : "hover:bg-accent cursor-pointer"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{meta.label}</span>
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
