"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  normalizeResponse,
  type DataItem,
  type FetchedData,
} from "@/lib/cockpit/normalize-response";
import { relativeTime } from "@/lib/cockpit/utils";
import {
  useCockpitStore,
  type PreviewTarget,
} from "@/lib/stores/useCockpitStore";

interface HUDPanelProps {
  panelId: string;
  title: string;
  accentColor: string;
  endpoint: string;
  /** Custom item renderer */
  renderItem?: (item: DataItem, index: number) => React.ReactNode;
  /** Map item to preview target for click-to-preview */
  toPreview?: (item: DataItem) => PreviewTarget;
  /** Max items to show */
  maxItems?: number;
  /** Auto-load data on mount */
  autoLoad?: boolean;
  className?: string;
}

/**
 * HUDPanel — Reusable FUI panel frame for cockpit wings.
 * Fetches data from endpoint, normalizes response, renders items.
 * Click on item → opens preview in center viewport.
 */
export function HUDPanel({
  panelId,
  title,
  accentColor,
  endpoint,
  renderItem,
  toPreview,
  maxItems = 10,
  autoLoad = true,
  className = "",
}: HUDPanelProps) {
  const collapsed = useCockpitStore((s) => s.collapsedPanels.has(panelId));
  const toggleCollapse = useCockpitStore((s) => s.togglePanelCollapse);
  const openPreview = useCockpitStore((s) => s.openPreview);

  const [data, setData] = useState<FetchedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

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
      .then((raw: unknown) => {
        setData(normalizeResponse(raw));
        setLoading(false);
      })
      .catch((err) => {
        console.error(`[HUDPanel:${panelId}] Fetch failed:`, {
          error: err instanceof Error ? err.message : String(err),
          endpoint,
        });
        setError(true);
        setLoading(false);
      });
  }, [endpoint, loading, panelId]);

  useEffect(() => {
    if (autoLoad) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const handleToggle = () => toggleCollapse(panelId);

  const handleItemClick = (item: DataItem) => {
    if (toPreview) {
      openPreview(toPreview(item));
    }
  };

  const items = data?.items?.slice(0, maxItems) || [];
  const itemCount = data?.items?.length || 0;

  return (
    <div
      className={`hud-panel hud-panel-enter ${collapsed ? "" : "expanded"} ${className}`}
      style={{ "--hud-accent": accentColor } as React.CSSProperties}
    >
      {/* Header */}
      <div className="hud-panel-header" onClick={handleToggle}>
        <span className="hud-panel-dot" />
        <span className="hud-panel-title">{title}</span>
        {itemCount > 0 && <span className="hud-panel-count">{itemCount}</span>}
        <span className="hud-panel-chevron">&#9662;</span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div
          className="hud-panel-body"
          style={{ maxHeight: 240, padding: "4px 0" }}
        >
          {loading && <LoadingSkeleton />}
          {error && (
            <ErrorState
              onRetry={() => {
                fetchedRef.current = false;
                fetchData();
              }}
            />
          )}
          {!loading && !error && items.length === 0 && data && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 11,
                color: "var(--hud-text-muted)",
              }}
            >
              Brak danych
            </div>
          )}
          {items.map((item, i) => {
            if (renderItem) return renderItem(item, i);
            return (
              <DefaultItem
                key={(item.id as string) || i}
                item={item}
                accentColor={accentColor}
                onClick={() => handleItemClick(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Default item renderer ── */
function DefaultItem({
  item,
  accentColor,
  onClick,
}: {
  item: DataItem;
  accentColor: string;
  onClick: () => void;
}) {
  const label = item.title || item.name || item.subject || "—";
  const meta = item.created_at
    ? relativeTime(item.created_at as string)
    : item.status
      ? String(item.status)
      : null;

  return (
    <div
      className="hud-item"
      style={{ "--hud-accent": accentColor } as React.CSSProperties}
      onClick={onClick}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {meta && <span className="hud-item-meta">{meta}</span>}
    </div>
  );
}

/* ── Skeleton ── */
function LoadingSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 12px",
      }}
    >
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            className="hud-skeleton"
            style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0 }}
          />
          <div
            className="hud-skeleton"
            style={{ height: 10, borderRadius: 3, width: `${50 + i * 12}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Error state ── */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--hud-red)",
          opacity: 0.5,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: "var(--hud-text-muted)", flex: 1 }}>
        Błąd ładowania
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        style={{
          fontSize: 10,
          color: "var(--hud-cyan)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 6px",
        }}
      >
        Ponów
      </button>
    </div>
  );
}
