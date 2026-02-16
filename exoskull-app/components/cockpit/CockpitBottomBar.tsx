"use client";

import { useEffect, useState } from "react";
import {
  Hammer,
  Search,
  Mail,
  StickyNote,
  FileText,
  Terminal,
} from "lucide-react";
import { HUDGauge } from "./HUDGauge";

/**
 * CockpitBottomBar — Quick actions (left), input area hint (center), gauges (right).
 */
export function CockpitBottomBar() {
  const [gaugeData, setGaugeData] = useState({
    health: 0,
    tasksDone: 0,
    unread: 0,
    goals: 0,
  });

  // Fetch gauge data
  useEffect(() => {
    const fetchGauges = async () => {
      try {
        const [healthRes, tasksRes, emailsRes] = await Promise.all([
          fetch("/api/canvas/data/system-health")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/canvas/data/tasks")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/canvas/data/emails")
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

        const unreadCount = emailsRes?.summary?.unread || 0;
        const unreadPct = Math.min(100, unreadCount * 10); // 10 unread = 100%

        setGaugeData({
          health,
          tasksDone,
          unread: unreadPct,
          goals: 50, // placeholder until goals endpoint exists
        });
      } catch (err) {
        console.error("[CockpitBottomBar] Gauge fetch failed:", err);
      }
    };

    fetchGauges();
  }, []);

  return (
    <div className="hud-bottombar">
      {/* Left: Quick Actions */}
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
        <QuickAction icon={<Hammer size={16} />} title="Buduj" />
        <QuickAction icon={<Search size={16} />} title="Szukaj" />
        <QuickAction icon={<Mail size={16} />} title="Email" />
        <QuickAction icon={<StickyNote size={16} />} title="Notatka" />
        <QuickAction icon={<FileText size={16} />} title="Raport" />
        <QuickAction icon={<Terminal size={16} />} title="VPS" />
      </div>

      {/* Center: spacer + input hint */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--hud-text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
          }}
        >
          WPISZ W CZACIE POWYŻEJ
        </span>
      </div>

      {/* Right: Gauges */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flex: "0 0 auto",
          alignItems: "center",
        }}
      >
        <HUDGauge
          value={gaugeData.health}
          label="System"
          color="var(--hud-green)"
        />
        <HUDGauge
          value={gaugeData.tasksDone}
          label="Zadania"
          color="var(--hud-blue)"
        />
        <HUDGauge
          value={gaugeData.unread}
          label="Email"
          color="var(--hud-cyan)"
        />
        <HUDGauge
          value={gaugeData.goals}
          label="Cele"
          color="var(--hud-amber)"
        />
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <button
      className="hud-quick-action"
      title={title}
      onClick={() => {
        // Quick actions could dispatch commands to the chat input
        // For now, they're visual placeholders
      }}
    >
      {icon}
    </button>
  );
}
