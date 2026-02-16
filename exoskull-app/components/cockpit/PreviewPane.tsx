"use client";

import { useEffect } from "react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { ArrowLeft } from "lucide-react";

/**
 * PreviewPane — Detail view for clicked items (email, task, document, etc.).
 * Reads from useCockpitStore.previewTarget.
 * Escape key → close preview, return to chat.
 */
export function PreviewPane() {
  const previewTarget = useCockpitStore((s) => s.previewTarget);
  const closePreview = useCockpitStore((s) => s.closePreview);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closePreview]);

  if (!previewTarget) {
    return (
      <div
        className="hud-preview"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--hud-text-muted)" }}>
          Kliknij element, aby zobaczyć szczegóły
        </span>
      </div>
    );
  }

  const { type, title, data } = previewTarget;

  return (
    <div
      className="hud-preview"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div className="hud-preview-header">
        <button
          onClick={closePreview}
          style={{
            background: "none",
            border: "1px solid var(--hud-border)",
            borderRadius: 4,
            color: "var(--hud-text-dim)",
            cursor: "pointer",
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--hud-cyan)";
            e.currentTarget.style.color = "var(--hud-cyan)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--hud-border)";
            e.currentTarget.style.color = "var(--hud-text-dim)";
          }}
        >
          <ArrowLeft size={12} />
          <span>ESC</span>
        </button>
        <TypeBadge type={type} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--hud-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
      </div>

      {/* Body */}
      <div className="hud-preview-body" style={{ flex: 1, overflowY: "auto" }}>
        {type === "email" && <EmailPreview data={data} />}
        {type === "task" && <TaskPreview data={data} />}
        {type === "document" && <DocumentPreview data={data} />}
        {type === "calendar" && <CalendarPreview data={data} />}
        {type === "activity" && <ActivityPreview data={data} />}
        {type === "value" && <ValuePreview data={data} />}
      </div>
    </div>
  );
}

/* ── Type Badge ── */
function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    email: "#06b6d4",
    task: "#3b82f6",
    document: "#10b981",
    calendar: "#f59e0b",
    activity: "#8b5cf6",
    value: "#f59e0b",
  };
  const labels: Record<string, string> = {
    email: "EMAIL",
    task: "ZADANIE",
    document: "DOKUMENT",
    calendar: "KALENDARZ",
    activity: "IORS",
    value: "WARTOŚĆ",
  };

  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        color: colors[type] || "var(--hud-text-dim)",
        border: `1px solid ${colors[type] || "var(--hud-border)"}`,
        borderRadius: 3,
        padding: "2px 6px",
        flexShrink: 0,
      }}
    >
      {labels[type] || type.toUpperCase()}
    </span>
  );
}

/* ── Preview renderers ── */
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "4px 0",
        borderBottom: "1px solid var(--hud-border)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--hud-text-muted)",
          minWidth: 80,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--hud-text)",
          flex: 1,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmailPreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FieldRow
        label="Od"
        value={String(data.from_name || data.from_email || "—")}
      />
      <FieldRow label="Temat" value={String(data.subject || "—")} />
      <FieldRow
        label="Data"
        value={
          data.received_at
            ? new Date(data.received_at as string).toLocaleString("pl-PL")
            : "—"
        }
      />
      <FieldRow label="Status" value={String(data.status || "—")} />
      {data.body_preview ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "var(--hud-text-dim)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {String(data.body_preview)}
        </div>
      ) : null}
    </div>
  );
}

function TaskPreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FieldRow label="Tytuł" value={String(data.title || "—")} />
      <FieldRow label="Status" value={String(data.status || "—")} />
      <FieldRow
        label="Priorytet"
        value={data.priority ? String(data.priority) : undefined}
      />
      {data.description ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "var(--hud-text-dim)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {String(data.description)}
        </div>
      ) : null}
    </div>
  );
}

function DocumentPreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FieldRow
        label="Plik"
        value={String(data.filename || data.title || "—")}
      />
      <FieldRow
        label="Kategoria"
        value={data.category ? String(data.category) : undefined}
      />
      <FieldRow
        label="Status"
        value={
          data.processing_status ? String(data.processing_status) : undefined
        }
      />
      <FieldRow
        label="Rozmiar"
        value={
          data.file_size
            ? `${Math.round((data.file_size as number) / 1024)} KB`
            : undefined
        }
      />
      {data.extracted_text ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "var(--hud-text-dim)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {String(data.extracted_text).slice(0, 2000)}
        </div>
      ) : null}
    </div>
  );
}

function CalendarPreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FieldRow label="Tytuł" value={String(data.title || "—")} />
      <FieldRow
        label="Data"
        value={
          data.date
            ? new Date(data.date as string).toLocaleString("pl-PL")
            : "—"
        }
      />
      <FieldRow label="Typ" value={data.type ? String(data.type) : undefined} />
      <FieldRow
        label="Link"
        value={data.link ? String(data.link) : undefined}
      />
    </div>
  );
}

function ActivityPreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FieldRow label="Akcja" value={String(data.action_name || "—")} />
      <FieldRow label="Typ" value={String(data.action_type || "—")} />
      <FieldRow label="Opis" value={String(data.description || "—")} />
      <FieldRow label="Status" value={String(data.status || "—")} />
      <FieldRow
        label="Źródło"
        value={data.source ? String(data.source) : undefined}
      />
      {data.metadata && typeof data.metadata === "object" ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--hud-text-muted)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
            background: "rgba(255,255,255,0.02)",
            padding: 8,
            borderRadius: 4,
          }}
        >
          {JSON.stringify(data.metadata, null, 2)}
        </div>
      ) : null}
    </div>
  );
}

function ValuePreview({ data }: { data?: Record<string, unknown> }) {
  if (!data) return <EmptyPreview />;
  const loops = Array.isArray(data.loops) ? data.loops : [];
  const imageUrl = data.imageUrl as string | undefined;
  const nodeType = data.nodeType as string | undefined;
  const progress = data.progress as number | undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Image banner */}
      {imageUrl && (
        <div style={{ marginBottom: 8 }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              width: "100%",
              height: 120,
              objectFit: "cover",
              borderRadius: 6,
              border: "1px solid var(--hud-border)",
            }}
          />
        </div>
      )}

      {nodeType && <FieldRow label="Typ" value={nodeType.toUpperCase()} />}
      <FieldRow
        label="Status"
        value={data.status ? String(data.status) : undefined}
      />
      <FieldRow
        label="Opis"
        value={data.description ? String(data.description) : undefined}
      />
      <FieldRow
        label="Priorytet"
        value={data.priority ? String(data.priority) : undefined}
      />
      <FieldRow
        label="Termin"
        value={
          data.dueDate
            ? new Date(data.dueDate as string).toLocaleDateString("pl-PL")
            : undefined
        }
      />

      {/* Progress bar */}
      {progress !== undefined && progress > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--hud-text-muted)",
              marginBottom: 4,
            }}
          >
            <span>POSTĘP</span>
            <span>{progress}%</span>
          </div>
          <div
            style={{
              width: "100%",
              height: 6,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "var(--hud-cyan, #06b6d4)",
                borderRadius: 3,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {loops.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--hud-text-muted)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Pętle ({loops.length})
          </span>
          {loops.map((loop: Record<string, unknown>, i: number) => (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderBottom: "1px solid var(--hud-border)",
                fontSize: 12,
                color: "var(--hud-text-dim)",
              }}
            >
              {String(loop.name || "Loop")} —{" "}
              {Array.isArray(loop.quests) ? loop.quests.length : 0} quests
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionButton label="Czatuj o tym" color="#06b6d4" />
        <ActionButton label="Dodaj zadanie" color="#3b82f6" />
        <ActionButton label="Edytuj" color="#8b5cf6" />
      </div>
    </div>
  );
}

function ActionButton({ label, color }: { label: string; color: string }) {
  return (
    <button
      onClick={() => {
        const store = useCockpitStore.getState();
        store.closePreview();
        // Return to chat — user can type about the topic
      }}
      style={{
        background: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        color: color,
        cursor: "pointer",
        padding: "6px 12px",
        fontSize: 11,
        fontFamily: "monospace",
        fontWeight: 600,
        letterSpacing: "0.03em",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}25`;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}15`;
        e.currentTarget.style.borderColor = `${color}40`;
      }}
    >
      {label}
    </button>
  );
}

function EmptyPreview() {
  return (
    <span style={{ fontSize: 12, color: "var(--hud-text-muted)" }}>
      Brak szczegółów
    </span>
  );
}
