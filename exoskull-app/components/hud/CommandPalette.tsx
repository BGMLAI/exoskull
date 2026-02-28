"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Target,
  Settings,
  BookOpen,
  Puzzle,
  Link,
  Sparkles,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSendMessage: (text: string) => void;
}

/**
 * CommandPalette — Ctrl+K / Cmd+K modal.
 * Fuzzy search over navigation targets and chat commands.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSendMessage,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "goals",
        label: "Cele",
        description: "Pokaz cele",
        icon: Target,
        action: () => onNavigate("/dashboard/goals"),
      },
      {
        id: "apps",
        label: "Aplikacje",
        description: "Pokaz aplikacje",
        icon: Puzzle,
        action: () => onNavigate("/dashboard/apps"),
      },
      {
        id: "knowledge",
        label: "Baza wiedzy",
        description: "Pokaz baze wiedzy",
        icon: BookOpen,
        action: () => onNavigate("/dashboard/knowledge"),
      },
      {
        id: "settings",
        label: "Ustawienia",
        description: "Pokaz ustawienia",
        icon: Settings,
        action: () => onNavigate("/dashboard/settings"),
      },
      {
        id: "integrations",
        label: "Integracje",
        description: "Pokaz integracje",
        icon: Link,
        action: () => onNavigate("/dashboard/integrations"),
      },
      {
        id: "skills",
        label: "Skille",
        description: "Pokaz skille",
        icon: Sparkles,
        action: () => onNavigate("/dashboard/skills"),
      },
    ],
    [onNavigate],
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [query, commands]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlight]) {
          filtered[highlight].action();
          onClose();
        } else if (query.trim()) {
          onSendMessage(query.trim());
          onClose();
        }
      }
    },
    [filtered, highlight, onClose, onSendMessage, query],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-md bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Szukaj komend..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <kbd className="text-[10px] text-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.map((cmd, idx) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                  idx === highlight
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/30",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{cmd.label}</span>
                  <span className="text-xs text-muted-foreground/60 ml-2">
                    {cmd.description}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground/50">
              Brak wynikow
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
