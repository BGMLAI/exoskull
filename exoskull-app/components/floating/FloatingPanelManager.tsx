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
  return (
    <DataPanel<TaskItem>
      endpoint="/api/canvas/data/tasks"
      emptyMessage="No tasks"
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
  return (
    <div className="p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground mb-2">Node Detail</p>
      <p className="text-xs opacity-60">
        Select a node in the mindmap to see its details here.
      </p>
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
