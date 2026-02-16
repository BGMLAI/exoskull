/**
 * @deprecated Replaced by `components/cockpit/HUDPanel.tsx` (Phase 8 — Cockpit HUD).
 * Kept for reference. The normalizeResponse logic was extracted to `lib/cockpit/normalize-response.ts`.
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Html } from "@react-three/drei";

/* ─────────────────────────── Types ─────────────────────────── */

interface DataItem {
  title?: string;
  name?: string;
  subject?: string;
  [key: string]: unknown;
}

interface FetchedData {
  items?: DataItem[];
  [key: string]: unknown;
}

export interface SpatialPanelProps {
  /** 3D world-space position [x, y, z] */
  position: [number, number, number];
  /** Panel header title */
  title: string;
  /** API endpoint to fetch data from */
  endpoint: string;
  /** Optional accent color (hex) — used for header dot and item bullets */
  accentColor?: string;
  /** Whether the panel starts expanded */
  defaultExpanded?: boolean;
  /** Unique panel identifier */
  panelId: string;
  /** Auto-load data on mount (instead of waiting for first expand) */
  autoLoad?: boolean;
}

/* ─────────────────── Skeleton / Error helpers ──────────────── */

function LoadingSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "4px 0",
      }}
    >
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.08)",
              animation: "pulse 1.5s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              height: 10,
              borderRadius: 4,
              backgroundColor: "rgba(255,255,255,0.06)",
              animation: "pulse 1.5s ease-in-out infinite",
              width: `${55 + i * 12}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 4px",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "rgba(239,68,68,0.5)",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        Nie udalo sie zaladowac
      </span>
    </div>
  );
}

/* ──────────────────── Item list renderer ───────────────────── */

const MAX_VISIBLE_ITEMS = 8;

function ItemList({
  items,
  accentColor,
}: {
  items: DataItem[];
  accentColor: string;
}) {
  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const remaining = items.length - MAX_VISIBLE_ITEMS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {visible.map((item, i) => {
        const label =
          item.title ||
          item.name ||
          item.subject ||
          JSON.stringify(item).slice(0, 60);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor =
                "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor =
                "rgba(255,255,255,0.02)";
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: `${accentColor}80`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
      {remaining > 0 && (
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            paddingLeft: 8,
          }}
        >
          +{remaining} wiecej
        </span>
      )}
    </div>
  );
}

function KeyValuePairs({ data }: { data: FetchedData }) {
  const entries = Object.entries(data).filter(
    ([, value]) => typeof value === "string" || typeof value === "number",
  );
  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map(([key, value]) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            padding: "2px 4px",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.4)" }}>{key}</span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>
            {String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── Preview (collapsed) ──────────────────── */

function PreviewItems({
  items,
  accentColor,
}: {
  items: DataItem[];
  accentColor: string;
}) {
  const preview = items.slice(0, 3);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}
    >
      {preview.map((item, i) => {
        const label =
          item.title ||
          item.name ||
          item.subject ||
          JSON.stringify(item).slice(0, 40);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "1px 0",
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: `${accentColor}60`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 200,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────── Polish label mapping ─────────────────────── */

const LABEL_MAP: Record<string, string> = {
  pending: "Oczekujace",
  in_progress: "W toku",
  done: "Gotowe",
  cancelled: "Anulowane",
  blocked: "Zablokowane",
  unread: "Nieprzeczytane",
  urgent: "Pilne",
  needsReply: "Wymaga odpowiedzi",
  overdueFollowUps: "Przeterminowane",
  todayReceived: "Dzis otrzymane",
  total_documents: "Dokumenty",
  total_chunks: "Fragmenty",
};

/* ──────────────── Response normalization ───────────────────── */

/**
 * Normalizes various API response shapes into { items: DataItem[] }.
 * Handles: flat arrays, { items }, { documents }, { stats }, { summary, urgentEmails }
 */
function normalizeResponse(raw: unknown): FetchedData {
  // Flat array (e.g. activity-feed returns [...])
  if (Array.isArray(raw)) {
    return {
      items: raw.map((entry) => ({
        title:
          entry.action_name ||
          entry.description ||
          entry.title ||
          entry.name ||
          JSON.stringify(entry).slice(0, 60),
        ...entry,
      })),
    };
  }

  const obj = raw as Record<string, unknown>;

  // Already has items array (calendar)
  if (Array.isArray(obj.items) && obj.items.length > 0) {
    return obj as FetchedData;
  }

  // Knowledge: { documents: [...] }
  if (Array.isArray(obj.documents) && obj.documents.length > 0) {
    return {
      items: obj.documents.map((doc: Record<string, unknown>) => ({
        title: (doc.filename || doc.title || doc.name || "Dokument") as string,
        name: (doc.category || "") as string,
        ...doc,
      })),
    };
  }

  // Emails: { summary: {...}, urgentEmails: [...] }
  if (obj.summary && typeof obj.summary === "object") {
    const summary = obj.summary as Record<string, unknown>;
    const urgentEmails = Array.isArray(obj.urgentEmails)
      ? obj.urgentEmails
      : [];
    // Show urgent emails if any, otherwise show summary stats
    if (urgentEmails.length > 0) {
      return {
        items: urgentEmails.map((e: Record<string, unknown>) => ({
          title: (e.subject || "Email") as string,
          name: (e.from_name || e.from_email || "") as string,
          ...e,
        })),
      };
    }
    // Show summary as key-value pairs
    return {
      items: Object.entries(summary)
        .filter(([, v]) => typeof v === "number")
        .map(([key, value]) => ({
          title: `${LABEL_MAP[key] || key}: ${value}`,
        })),
    };
  }

  // Tasks: { stats: {...} }
  if (obj.stats && typeof obj.stats === "object") {
    const stats = obj.stats as Record<string, unknown>;
    return {
      items: Object.entries(stats)
        .filter(([, v]) => typeof v === "number" || typeof v === "string")
        .map(([key, value]) => ({
          title: `${LABEL_MAP[key] || key}: ${value}`,
        })),
    };
  }

  return obj as FetchedData;
}

/* ════════════════════════════════════════════════════════════════
 *  SpatialPanel — glass-morphism data card rendered in 3D space
 * ════════════════════════════════════════════════════════════════ */

export function SpatialPanel({
  position,
  title,
  endpoint,
  accentColor = "#06b6d4",
  defaultExpanded = false,
  panelId,
  autoLoad = false,
}: SpatialPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [data, setData] = useState<FetchedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  /* ── Data fetching (lazy by default) ── */
  const fetchData = useCallback(() => {
    if (fetchedRef.current || loading) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(false);

    fetch(endpoint)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: unknown) => {
        setData(normalizeResponse(d));
        setLoading(false);
      })
      .catch((err) => {
        console.error(`[SpatialPanel:${panelId}] Fetch failed:`, {
          error: err instanceof Error ? err.message : String(err),
          endpoint,
        });
        setError(true);
        setLoading(false);
      });
  }, [endpoint, loading, panelId]);

  /* Auto-load on mount if requested */
  useEffect(() => {
    if (autoLoad) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  /* ── Toggle handler ── */
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = !expanded;
      setExpanded(next);
      if (next && !fetchedRef.current) {
        fetchData();
      }
    },
    [expanded, fetchData],
  );

  /* ── Determine what data sub-view to show ── */
  const hasItems =
    data?.items && Array.isArray(data.items) && data.items.length > 0;

  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      transform
      style={{ pointerEvents: "auto" }}
    >
      {/* Inject keyframe animation for loading pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div
        style={{
          width: 200,
          maxHeight: expanded ? 280 : "auto",
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          overflow: "hidden",
          transition: "max-height 0.3s ease-out",
          userSelect: "none",
        }}
      >
        {/* ── Header ── */}
        <div
          onClick={handleToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            cursor: "pointer",
            borderBottom: expanded
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "rgba(255,255,255,0.04)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "transparent";
          }}
        >
          {/* Accent dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: accentColor,
              boxShadow: `0 0 8px ${accentColor}60`,
              flexShrink: 0,
            }}
          />

          {/* Title */}
          <span
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: 0.3,
            }}
          >
            {title}
          </span>

          {/* Expand indicator */}
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              transition: "transform 0.2s",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            &#9662;
          </span>
        </div>

        {/* ── Collapsed preview ── */}
        {!expanded && hasItems && (
          <div style={{ padding: "2px 14px 8px" }}>
            <PreviewItems items={data!.items!} accentColor={accentColor} />
          </div>
        )}

        {/* ── Expanded content ── */}
        {expanded && (
          <div
            style={{
              overflowY: "auto",
              maxHeight: 260,
              padding: "8px 10px 10px",
            }}
          >
            {loading && <LoadingSkeleton />}
            {error && <ErrorState />}
            {data && hasItems && (
              <ItemList items={data.items!} accentColor={accentColor} />
            )}
            {data && !hasItems && <KeyValuePairs data={data} />}
          </div>
        )}
      </div>
    </Html>
  );
}
