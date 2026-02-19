"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import {
  MessageSquare,
  CheckSquare,
  Calendar,
  BookOpen,
  Mail,
  Network,
} from "lucide-react";
import { FloatingPanel } from "./FloatingPanel";
import { PanelDock } from "./PanelDock";
import {
  useFloatingPanelsStore,
  type PanelId,
} from "@/lib/stores/useFloatingPanelsStore";

// ── Lazy imports ──────────────────────────────────────────────────────────────

const HomeChat = lazy(() =>
  import("@/components/dashboard/HomeChat").then((m) => ({
    default: m.HomeChat,
  })),
);

// ── Shared DataPanel ──────────────────────────────────────────────────────────

interface DataPanelProps<T> {
  endpoint: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
}

function DataPanel<T>({
  endpoint,
  renderItem,
  emptyMessage = "No items",
}: DataPanelProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // Accept both array responses and { data: T[] } shaped responses
        const arr = Array.isArray(data)
          ? data
          : (data?.data ?? data?.items ?? []);
        setItems(arr);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error("[DataPanel] Failed to fetch:", {
          error: err.message,
          endpoint,
          stack: err.stack,
        });
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (loading) {
    return (
      <div className="p-3 flex flex-col gap-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-md bg-muted animate-pulse"
            style={{ opacity: 1 - i * 0.2 }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        <p className="text-destructive mb-1">Failed to load</p>
        <p className="text-xs opacity-60">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="p-2 flex flex-col gap-1">
      {items.map((item, i) => renderItem(item, i))}
    </ul>
  );
}

// ── Panel content renderers ────────────────────────────────────────────────────

interface TaskItem {
  id: string;
  title?: string;
  name?: string;
  done?: boolean;
  completed?: boolean;
  priority?: string;
  due_date?: string;
}

function TasksContent() {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/canvas/data/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setNewTitle("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("[TasksContent] Failed to add task:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add task form */}
      <div className="p-2 border-b border-border flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Nowe zadanie..."
          className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={adding}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? "..." : "+"}
        </button>
      </div>

      {/* Task list — refreshKey in the endpoint forces DataPanel to re-fetch */}
      <DataPanel<TaskItem>
        endpoint={`/api/canvas/data/tasks?_r=${refreshKey}`}
        emptyMessage="Brak zadan"
        renderItem={(task, i) => (
          <li
            key={task.id ?? i}
            className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm"
          >
            <span
              className={`mt-0.5 w-3.5 h-3.5 rounded-sm flex-shrink-0 border ${
                task.done || task.completed
                  ? "bg-primary border-primary"
                  : "border-border"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p
                className={`truncate ${
                  task.done || task.completed
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {task.title ?? task.name ?? "Untitled task"}
              </p>
              {task.due_date && (
                <p className="text-xs text-muted-foreground">
                  {new Date(task.due_date).toLocaleDateString()}
                </p>
              )}
            </div>
            {task.priority && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                {task.priority}
              </span>
            )}
          </li>
        )}
      />
    </div>
  );
}

interface CalendarItem {
  id: string;
  title?: string;
  summary?: string;
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
}

function resolveDate(val: CalendarItem["start"]): string | undefined {
  if (!val) return undefined;
  if (typeof val === "string") return val;
  return val.dateTime ?? val.date;
}

function CalendarContent() {
  return (
    <DataPanel<CalendarItem>
      endpoint="/api/canvas/data/calendar"
      emptyMessage="No upcoming events"
      renderItem={(event, i) => {
        const startStr = resolveDate(event.start);
        return (
          <li
            key={event.id ?? i}
            className="px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm border-l-2 border-amber-500/60 pl-3"
          >
            <p className="truncate font-medium text-foreground">
              {event.title ?? event.summary ?? "Untitled event"}
            </p>
            {startStr && (
              <p className="text-xs text-muted-foreground">
                {new Date(startStr).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </li>
        );
      }}
    />
  );
}

interface KnowledgeItem {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  updated_at?: string;
}

function KnowledgeContent() {
  return (
    <DataPanel<KnowledgeItem>
      endpoint="/api/knowledge"
      emptyMessage="No knowledge items"
      renderItem={(item, i) => (
        <li
          key={item.id ?? i}
          className="px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm"
        >
          <p className="truncate text-foreground">
            {item.title ?? item.name ?? "Untitled"}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                {item.type}
              </span>
            )}
            {item.updated_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(item.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </li>
      )}
    />
  );
}

interface EmailItem {
  id: string;
  subject?: string;
  from?: string | { email?: string; name?: string };
  date?: string;
  read?: boolean;
}

function resolveFrom(from: EmailItem["from"]): string {
  if (!from) return "";
  if (typeof from === "string") return from;
  return from.name ?? from.email ?? "";
}

function EmailContent() {
  return (
    <DataPanel<EmailItem>
      endpoint="/api/canvas/data/emails"
      emptyMessage="No emails"
      renderItem={(email, i) => (
        <li
          key={email.id ?? i}
          className={`px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm ${
            !email.read ? "font-medium" : ""
          }`}
        >
          <p className="truncate text-foreground">
            {email.subject ?? "No subject"}
          </p>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">
              {resolveFrom(email.from)}
            </p>
            {email.date && (
              <p className="text-xs text-muted-foreground flex-shrink-0">
                {new Date(email.date).toLocaleDateString()}
              </p>
            )}
          </div>
        </li>
      )}
    />
  );
}

function NodeDetailContent() {
  const node = useFloatingPanelsStore((s) => s.selectedNode);

  if (!node) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-2">Node Detail</p>
        <p className="text-xs opacity-60">
          Kliknij prawym przyciskiem na węzeł i wybierz &quot;Szczegóły&quot;.
        </p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: "text-green-400 bg-green-900/20 border-green-800/30",
    paused: "text-yellow-400 bg-yellow-900/20 border-yellow-800/30",
    completed: "text-cyan-400 bg-cyan-900/20 border-cyan-800/30",
    abandoned: "text-red-400 bg-red-900/20 border-red-800/30",
  };

  return (
    <div className="px-4 py-3 space-y-3 overflow-y-auto chat-scroll text-sm">
      {/* Header */}
      <div>
        <div className="text-[10px] font-mono text-primary uppercase tracking-wider mb-0.5">
          {node.type}
        </div>
        <h3 className="text-sm font-medium text-foreground">{node.name}</h3>
      </div>

      {/* Status */}
      {node.status && (
        <div>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Status
          </label>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${statusColors[node.status] || "text-muted-foreground bg-muted border-border"}`}
          >
            {node.status}
          </span>
        </div>
      )}

      {/* Description */}
      {node.description && (
        <div>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Opis
          </label>
          <p className="text-xs text-foreground leading-relaxed">
            {node.description}
          </p>
        </div>
      )}

      {/* Progress */}
      {node.progress !== undefined && node.progress > 0 && (
        <div>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Postep
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, node.progress)}%` }}
              />
            </div>
            <span className="text-[11px] text-primary font-mono">
              {Math.round(node.progress)}%
            </span>
          </div>
        </div>
      )}

      {/* Tags */}
      {node.tags && node.tags.length > 0 && (
        <div>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
            Tagi
          </label>
          <div className="flex flex-wrap gap-1">
            {node.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Color */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full border border-white/10"
          style={{ backgroundColor: node.color }}
        />
        <span className="text-[10px] text-muted-foreground font-mono">
          {node.color}
        </span>
      </div>
    </div>
  );
}

// ── Panel config map ───────────────────────────────────────────────────────────

interface PanelConfig {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  closable?: boolean;
  content: React.ReactNode;
}

const PANEL_CONFIG: Record<PanelId, PanelConfig> = {
  chat: {
    title: "Chat",
    icon: <MessageSquare className="w-4 h-4" />,
    accentColor: "#06B6D4",
    closable: false,
    // Default content shown when tenantId is not passed to FloatingPanelManager.
    // resolvedConfig() overrides this with the real tenantId at render time.
    content: (
      <div className="p-4 text-sm text-muted-foreground">
        Provide tenantId to FloatingPanelManager to enable chat.
      </div>
    ),
  },
  tasks: {
    title: "Tasks",
    icon: <CheckSquare className="w-4 h-4" />,
    accentColor: "#10B981",
    closable: true,
    content: <TasksContent />,
  },
  calendar: {
    title: "Calendar",
    icon: <Calendar className="w-4 h-4" />,
    accentColor: "#F59E0B",
    closable: true,
    content: <CalendarContent />,
  },
  knowledge: {
    title: "Knowledge",
    icon: <BookOpen className="w-4 h-4" />,
    accentColor: "#8B5CF6",
    closable: true,
    content: <KnowledgeContent />,
  },
  email: {
    title: "Email",
    icon: <Mail className="w-4 h-4" />,
    accentColor: "#EC4899",
    closable: true,
    content: <EmailContent />,
  },
  "node-detail": {
    title: "Node Detail",
    icon: <Network className="w-4 h-4" />,
    accentColor: "#3B82F6",
    closable: true,
    content: <NodeDetailContent />,
  },
};

// ── FloatingPanelManager ──────────────────────────────────────────────────────

interface FloatingPanelManagerProps {
  /** Pass the current tenant ID so ChatPanel can authenticate requests */
  tenantId?: string;
}

export function FloatingPanelManager({ tenantId }: FloatingPanelManagerProps) {
  const panels = useFloatingPanelsStore((s) => s.panels);

  const openIds = Object.keys(panels) as PanelId[];

  // Build panel config with runtime tenantId for chat
  const resolvedConfig = (id: PanelId): PanelConfig => {
    if (id === "chat" && tenantId) {
      return {
        ...PANEL_CONFIG.chat,
        content: (
          <Suspense
            fallback={
              <div className="p-4 text-sm text-muted-foreground">
                Loading chat...
              </div>
            }
          >
            <HomeChat tenantId={tenantId} />
          </Suspense>
        ),
      };
    }
    return PANEL_CONFIG[id];
  };

  return (
    <>
      {openIds.map((id) => {
        const config = resolvedConfig(id);
        if (!config) return null;

        return (
          <FloatingPanel
            key={id}
            id={id}
            title={config.title}
            icon={config.icon}
            accentColor={config.accentColor}
            closable={config.closable ?? true}
          >
            {config.content}
          </FloatingPanel>
        );
      })}

      <PanelDock />
    </>
  );
}
