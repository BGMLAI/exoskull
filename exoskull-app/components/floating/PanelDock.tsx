"use client";

import {
  MessageSquare,
  CheckSquare,
  Calendar,
  BookOpen,
  Mail,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFloatingPanelsStore,
  type PanelId,
} from "@/lib/stores/useFloatingPanelsStore";

interface DockItem {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
}

const DOCK_ITEMS: DockItem[] = [
  {
    id: "chat",
    label: "Chat",
    icon: <MessageSquare className="w-5 h-5" />,
    accentColor: "#06B6D4", // cyan
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: <CheckSquare className="w-5 h-5" />,
    accentColor: "#10B981", // emerald
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: <Calendar className="w-5 h-5" />,
    accentColor: "#F59E0B", // amber
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: <BookOpen className="w-5 h-5" />,
    accentColor: "#8B5CF6", // violet
  },
  {
    id: "email",
    label: "Email",
    icon: <Mail className="w-5 h-5" />,
    accentColor: "#EC4899", // rose
  },
];

export function PanelDock() {
  const panels = useFloatingPanelsStore((s) => s.panels);
  const openPanel = useFloatingPanelsStore((s) => s.openPanel);
  const closePanel = useFloatingPanelsStore((s) => s.closePanel);
  const restorePanel = useFloatingPanelsStore((s) => s.restorePanel);
  const minimizePanel = useFloatingPanelsStore((s) => s.minimizePanel);

  const handleClick = (item: DockItem) => {
    const state = panels[item.id];

    if (!state) {
      // Panel not open — open it
      openPanel(item.id);
      return;
    }

    if (state.minimized) {
      // Panel minimized — restore it
      restorePanel(item.id);
      return;
    }

    // Panel visible — minimize it (acts as toggle)
    minimizePanel(item.id);
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-1 px-3 py-2",
        "bg-card/80 backdrop-blur-md",
        "border border-border border-b-0",
        "rounded-t-xl shadow-lg",
      )}
    >
      {DOCK_ITEMS.map((item) => {
        const state = panels[item.id];
        const isOpen = !!state && !state.minimized;
        const isMinimized = !!state && state.minimized;

        return (
          <button
            key={item.id}
            onClick={() => handleClick(item)}
            title={item.label}
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg",
              "text-xs font-medium transition-all duration-150",
              isOpen
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
            style={
              isOpen
                ? { borderTop: `2px solid ${item.accentColor}` }
                : undefined
            }
          >
            {/* Minimized badge */}
            {isMinimized && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-card"
                style={{ backgroundColor: item.accentColor }}
                aria-label="minimized"
              />
            )}

            <span style={isOpen ? { color: item.accentColor } : undefined}>
              {item.icon}
            </span>
            <span className="leading-none">{item.label}</span>

            {/* Active indicator dot */}
            {isOpen && (
              <span
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                style={{ backgroundColor: item.accentColor }}
              />
            )}
          </button>
        );
      })}

      {/* Divider */}
      <div className="w-px h-8 bg-border mx-1" />

      {/* Widget picker placeholder */}
      <button
        className={cn(
          "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg",
          "text-xs font-medium text-muted-foreground",
          "hover:text-foreground hover:bg-accent/50 transition-all duration-150",
          "border border-dashed border-border/50",
        )}
        title="Add widget (coming soon)"
        onClick={() => {
          // TODO: open widget picker
        }}
      >
        <Plus className="w-5 h-5" />
        <span className="leading-none">Add</span>
      </button>
    </div>
  );
}
