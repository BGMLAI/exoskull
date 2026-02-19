"use client";

import { Trash2, Activity, BookOpen, Bookmark } from "lucide-react";
import { HUDGauge } from "./HUDGauge";
import { useEffect, useState, useRef, useCallback } from "react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";

/**
 * CockpitActionBar — 5-cell action bar at the very bottom of the cockpit.
 *
 * Layout (per mockup):
 * ┌──────┬──────────┬───────────────┬──────────┬──────┐
 * │delete│ proces   │   [input]     │ wiedza/  │zacho-│
 * │black │ iors     │               │ kontekst │ waj  │
 * │hole  │          │               │          │      │
 * └──────┴──────────┴───────────────┴──────────┴──────┘
 */
export function CockpitActionBar() {
  const openPreview = useCockpitStore((s) => s.openPreview);
  const sendFromActionBar = useCockpitStore((s) => s.sendFromActionBar);
  const previewTarget = useCockpitStore((s) => s.previewTarget);
  const closePreview = useCockpitStore((s) => s.closePreview);

  const [gaugeData, setGaugeData] = useState({
    health: 0,
    tasksDone: 0,
  });

  useEffect(() => {
    const fetchGauges = async () => {
      try {
        const [healthRes, tasksRes] = await Promise.all([
          fetch("/api/canvas/data/system-health")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/canvas/data/tasks")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        const health =
          healthRes?.overall_status === "healthy"
            ? 100
            : healthRes?.overall_status === "degraded"
              ? 60
              : healthRes?.overall_status === "critical"
                ? 20
                : 0;

        const stats = tasksRes?.stats;
        const total = stats?.total || 0;
        const done = stats?.done || 0;
        const tasksDone = total > 0 ? Math.round((done / total) * 100) : 0;

        setGaugeData({ health, tasksDone });
      } catch (err) {
        console.error("[CockpitActionBar] Gauge fetch failed:", err);
      }
    };
    fetchGauges();
  }, []);

  // Chat input
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim()) return;
    sendFromActionBar(inputValue.trim());
    setInputValue("");
  }, [inputValue, sendFromActionBar]);

  // DELETE: If preview is open, ask IORS to delete that item. Otherwise clear chat.
  const handleDelete = useCallback(() => {
    if (previewTarget) {
      sendFromActionBar(
        `/delete ${previewTarget.type}:${previewTarget.id} "${previewTarget.title}"`,
      );
      closePreview();
    } else {
      sendFromActionBar("/clear");
    }
  }, [previewTarget, sendFromActionBar, closePreview]);

  // IORS: Show IORS status in preview
  const handleIORSClick = useCallback(() => {
    openPreview({
      type: "activity",
      id: "iors-status",
      title: "Status IORS",
      data: {
        action_name: "System Status",
        action_type: "status",
        description: `System: ${gaugeData.health}% | Zadania: ${gaugeData.tasksDone}%`,
        status:
          gaugeData.health >= 80
            ? "healthy"
            : gaugeData.health >= 50
              ? "degraded"
              : "critical",
      },
    });
  }, [openPreview, gaugeData]);

  // ZACHOWAJ: Bookmark the current preview item or ask IORS to save context
  const handleSave = useCallback(() => {
    if (previewTarget) {
      sendFromActionBar(
        `/save ${previewTarget.type}:${previewTarget.id} "${previewTarget.title}"`,
      );
    } else {
      sendFromActionBar("/save Zachowaj bieżący kontekst rozmowy");
    }
  }, [previewTarget, sendFromActionBar]);

  return (
    <div className="hud-action-bar">
      {/* Cell 1: Delete / Black Hole */}
      <button
        className="hud-action-cell hud-action-cell--danger"
        title={previewTarget ? `Usuń: ${previewTarget.title}` : "Wyczyść czat"}
        aria-label={previewTarget ? "Usuń wybrany element" : "Wyczyść czat"}
        onClick={handleDelete}
      >
        <Trash2 size={16} aria-hidden="true" />
        <span className="hud-action-label">USUŃ</span>
      </button>

      {/* Cell 2: IORS Process + mini gauges */}
      <button
        className="hud-action-cell hud-action-cell--process"
        title="Status IORS"
        aria-label="Pokaż status IORS"
        onClick={handleIORSClick}
      >
        <Activity size={14} style={{ color: "var(--hud-purple)" }} />
        <span
          className="hud-action-label"
          style={{ color: "var(--hud-purple)" }}
        >
          IORS
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <HUDGauge
            value={gaugeData.health}
            label="SYS"
            color="var(--hud-green)"
            size={32}
          />
          <HUDGauge
            value={gaugeData.tasksDone}
            label="TSK"
            color="var(--hud-blue)"
            size={32}
          />
        </div>
      </button>

      {/* Cell 3: Input (center, largest) */}
      <div className="hud-action-cell hud-action-cell--input">
        <label htmlFor="cockpit-command-input" className="sr-only">
          Polecenie dla IORS
        </label>
        <input
          ref={inputRef}
          id="cockpit-command-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Wpisz polecenie..."
          className="hud-action-input"
          aria-describedby="cockpit-input-hint"
        />
        <span id="cockpit-input-hint" className="sr-only">
          Wpisz polecenie i naciśnij Enter aby wysłać
        </span>
      </div>

      {/* Cell 4: Knowledge / Context */}
      <button
        className="hud-action-cell hud-action-cell--knowledge"
        title="Wiedza / Kontekst"
        aria-label="Otwórz bazę wiedzy"
        onClick={() =>
          openPreview({
            type: "document",
            id: "knowledge-overview",
            title: "Baza wiedzy",
            data: {},
          })
        }
      >
        <BookOpen size={16} style={{ color: "var(--hud-green)" }} />
        <span
          className="hud-action-label"
          style={{ color: "var(--hud-green)" }}
        >
          WIEDZA
        </span>
      </button>

      {/* Cell 5: Save / Bookmark */}
      <button
        className="hud-action-cell hud-action-cell--save"
        title={
          previewTarget
            ? `Zachowaj: ${previewTarget.title}`
            : "Zachowaj kontekst"
        }
        aria-label="Zachowaj bieżący element"
        onClick={handleSave}
      >
        <Bookmark size={16} style={{ color: "var(--hud-amber)" }} />
        <span
          className="hud-action-label"
          style={{ color: "var(--hud-amber)" }}
        >
          ZACHOWAJ
        </span>
      </button>
    </div>
  );
}
