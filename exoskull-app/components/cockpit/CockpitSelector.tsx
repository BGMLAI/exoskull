"use client";

import {
  useCockpitStore,
  type CockpitStyle,
} from "@/lib/stores/useCockpitStore";
import { cn } from "@/lib/utils";
import { Rocket, Terminal, Minimize2, Cog, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CockpitSkin {
  id: CockpitStyle;
  label: string;
  description: string;
  icon: React.ElementType;
  accentColor: string;
}

const COCKPIT_SKINS: CockpitSkin[] = [
  {
    id: "scifi-spaceship",
    label: "Sci-Fi Spaceship",
    description: "Curved hull panels with holographic visor glow",
    icon: Rocket,
    accentColor: "#00d4ff",
  },
  {
    id: "cyberpunk-terminal",
    label: "Cyberpunk Terminal",
    description: "Angular neon frames with flickering data strips",
    icon: Terminal,
    accentColor: "#ff00ff",
  },
  {
    id: "minimalist-command",
    label: "Minimalist Command",
    description: "Clean glass panels with thin metal edges",
    icon: Minimize2,
    accentColor: "#d4d4d8",
  },
  {
    id: "steampunk-control",
    label: "Steampunk Control",
    description: "Riveted brass arches with rotating gears",
    icon: Cog,
    accentColor: "#cd7f32",
  },
  {
    id: "military-hud",
    label: "Military HUD",
    description: "Angular armor plating with tactical green accents",
    icon: Shield,
    accentColor: "#00ff41",
  },
];

interface CockpitSelectorProps {
  className?: string;
}

export function CockpitSelector({ className }: CockpitSelectorProps) {
  const cockpitStyle = useCockpitStore((s) => s.cockpitStyle);
  const setCockpitStyle = useCockpitStore((s) => s.setCockpitStyle);
  const [saving, setSaving] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("exo-cockpit-style");
      if (stored) setCockpitStyle(stored as CockpitStyle);
    } catch {
      /* noop */
    }
  }, [setCockpitStyle]);

  const handleSelect = useCallback(
    async (style: CockpitStyle) => {
      setCockpitStyle(style);
      // Persist to localStorage
      try {
        localStorage.setItem("exo-cockpit-style", style);
      } catch {
        /* noop */
      }
      // Persist to backend (best-effort)
      setSaving(true);
      try {
        await fetch("/api/settings/cockpit", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cockpit_style: style }),
        });
      } catch (err) {
        console.error("[CockpitSelector] Save failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [setCockpitStyle],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-medium text-foreground">
          Cockpit Skin
        </h3>
        {saving && (
          <span className="text-[10px] text-muted-foreground animate-pulse">
            Saving...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* None / default option */}
        <button
          onClick={() => handleSelect("none")}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border text-left text-sm transition-all",
            cockpitStyle === "none"
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border hover:bg-accent/50",
          )}
        >
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
            <span className="text-xs font-mono">OFF</span>
          </div>
          <div>
            <p className="font-medium text-foreground text-xs">No Cockpit</p>
            <p className="text-[10px] text-muted-foreground">
              Clean 3D grid only
            </p>
          </div>
        </button>

        {COCKPIT_SKINS.map((skin) => {
          const Icon = skin.icon;
          const isActive = cockpitStyle === skin.id;
          return (
            <button
              key={skin.id}
              onClick={() => handleSelect(skin.id)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border text-left text-sm transition-all",
                isActive
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{
                  backgroundColor: `${skin.accentColor}20`,
                  color: skin.accentColor,
                }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-foreground text-xs">
                  {skin.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {skin.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
