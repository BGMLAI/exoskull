"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2, Star, Trash2 } from "lucide-react";
import type { AppColumn, AppUiConfig, AppFormField } from "@/lib/apps/types";

interface AppWidgetProps {
  appSlug: string;
}

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface AppData {
  app: {
    slug: string;
    name: string;
    columns: AppColumn[];
    ui_config: AppUiConfig;
  };
  entries: AppEntry[];
  total: number;
}

export function AppWidget({ appSlug }: AppWidgetProps) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appSlug}/data`);
      if (!res.ok) {
        setError(
          res.status === 404 ? "Aplikacja nie znaleziona" : "Błąd ładowania",
        );
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError("Nie można załadować danych");
      console.error("[AppWidget] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [appSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appSlug}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormData({});
        setShowForm(false);
        await fetchData();
      } else {
        const err = await res.json();
        setError(err.error || "Błąd zapisu");
      }
    } catch (err) {
      setError("Nie można zapisać danych");
      console.error("[AppWidget] Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        <div className="h-4 w-1/2 bg-muted rounded" />
        <div className="h-8 w-full bg-muted rounded" />
        <div className="h-8 w-full bg-muted rounded" />
      </div>
    );
  }

  if (error && !data) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }

  if (!data) return null;

  const { app, entries } = data;
  const { ui_config } = app;
  const color = ui_config.color || "violet";

  return (
    <div className="flex flex-col h-full p-3 gap-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{app.name}</h3>
          {ui_config.summary && (
            <p className="text-xs text-muted-foreground">
              {computeSummary(entries, ui_config.summary)}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`p-1.5 rounded-md hover:bg-${color}-500/20 text-${color}-400 transition-colors`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="border border-border rounded-md p-2 space-y-2 bg-card/50">
          {ui_config.form_fields.map((field) => (
            <FormField
              key={field.column}
              field={field}
              value={formData[field.column]}
              onChange={(val) =>
                setFormData((prev) => ({ ...prev, [field.column]: val }))
              }
            />
          ))}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 text-xs py-1.5 rounded bg-${color}-600 hover:bg-${color}-500 text-white disabled:opacity-50 transition-colors`}
            >
              {submitting ? (
                <Loader2 className="w-3 h-3 animate-spin mx-auto" />
              ) : (
                "Dodaj"
              )}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setFormData({});
              }}
              className="text-xs py-1.5 px-3 rounded bg-muted hover:bg-muted/80 transition-colors"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Brak wpisów. Kliknij + aby dodać pierwszy.
          </p>
        ) : (
          entries
            .slice(0, 20)
            .map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                displayColumns={ui_config.display_columns}
                columns={app.columns}
              />
            ))
        )}
      </div>
    </div>
  );
}

/** Render a single form field */
function FormField({
  field,
  value,
  onChange,
}: {
  field: AppFormField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const baseClass =
    "w-full text-xs rounded border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500";

  switch (field.type) {
    case "text":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <input
            type="text"
            className={baseClass}
            placeholder={field.placeholder}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        </div>
      );
    case "number":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <input
            type="number"
            className={baseClass}
            placeholder={field.placeholder}
            value={(value as number) ?? ""}
            min={field.min}
            max={field.max}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null)
            }
            required={field.required}
          />
        </div>
      );
    case "date":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <input
            type="date"
            className={baseClass}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-border"
          />
          {field.label}
        </label>
      );
    case "textarea":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <textarea
            className={`${baseClass} resize-none`}
            rows={2}
            placeholder={field.placeholder}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "rating":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <div className="flex gap-1 mt-0.5">
            {Array.from({ length: field.max || 5 }, (_, i) => i + 1).map(
              (n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  className="p-0.5"
                >
                  <Star
                    className={`w-4 h-4 ${
                      n <= ((value as number) || 0)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ),
            )}
          </div>
        </div>
      );
    case "select":
      return (
        <div>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          <select
            className={baseClass}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">Wybierz...</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    default:
      return null;
  }
}

/** Render a single entry row */
function EntryRow({
  entry,
  displayColumns,
  columns,
}: {
  entry: AppEntry;
  displayColumns: string[];
  columns: AppColumn[];
}) {
  const colMap = new Map(columns.map((c) => [c.name, c]));

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors text-xs">
      <div className="flex-1 min-w-0 flex flex-wrap gap-x-3 gap-y-0.5">
        {displayColumns.slice(0, 4).map((colName) => {
          const col = colMap.get(colName);
          const val = entry[colName];
          if (val === null || val === undefined) return null;

          return (
            <span key={colName} className="truncate">
              <span className="text-muted-foreground">
                {col?.description || colName}:{" "}
              </span>
              {formatValue(val, col?.type)}
            </span>
          );
        })}
      </div>
      <span className="text-muted-foreground shrink-0">
        {new Date(entry.created_at).toLocaleDateString("pl")}
      </span>
    </div>
  );
}

/** Format a value based on column type */
function formatValue(val: unknown, type?: string): string {
  if (val === null || val === undefined) return "-";
  if (type === "boolean") return val ? "Tak" : "Nie";
  if (type === "date" || type === "timestamptz") {
    try {
      return new Date(val as string).toLocaleDateString("pl");
    } catch {
      return String(val);
    }
  }
  if (type === "integer" && typeof val === "number") {
    // Could be a rating
    return String(val);
  }
  return String(val);
}

/** Compute summary stat */
function computeSummary(
  entries: AppEntry[],
  summary: { column: string; aggregation: string; label: string },
): string {
  if (entries.length === 0) return `0 ${summary.label}`;

  switch (summary.aggregation) {
    case "count":
      return `${entries.length} ${summary.label}`;
    case "sum": {
      const total = entries.reduce(
        (sum, e) => sum + (Number(e[summary.column]) || 0),
        0,
      );
      return `${total} ${summary.label}`;
    }
    case "avg": {
      const avg =
        entries.reduce((sum, e) => sum + (Number(e[summary.column]) || 0), 0) /
        entries.length;
      return `${avg.toFixed(1)} ${summary.label}`;
    }
    case "min": {
      const min = Math.min(
        ...entries.map((e) => Number(e[summary.column]) || Infinity),
      );
      return `${min} ${summary.label}`;
    }
    case "max": {
      const max = Math.max(
        ...entries.map((e) => Number(e[summary.column]) || -Infinity),
      );
      return `${max} ${summary.label}`;
    }
    default:
      return `${entries.length} ${summary.label}`;
  }
}
