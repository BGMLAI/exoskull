"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { OrbNodeType } from "@/lib/types/orb-types";

/** Human-readable Polish labels per node type */
const TYPE_NAME_MAP: Record<OrbNodeType, string> = {
  value: "Wartość",
  loop: "Obszar",
  quest: "Quest",
  mission: "Misja",
  challenge: "Wyzwanie",
  op: "Zadanie",
};

/** Preset color palette for orbs */
const COLOR_PALETTE: string[] = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

/** Priority options */
const PRIORITIES = [
  { value: "low", label: "Niski" },
  { value: "medium", label: "Średni" },
  { value: "high", label: "Wysoki" },
] as const;

interface OrbFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  nodeType: OrbNodeType;
  parentId?: string | null;
  initialData?: {
    id: string;
    label: string;
    color: string;
    description?: string;
    priority?: string;
  };
  onSubmit: (data: {
    label: string;
    color: string;
    description?: string;
    priority?: string;
  }) => Promise<boolean>;
}

/**
 * OrbFormDialog — Modal dialog for creating/editing orbs at any hierarchy level.
 * Dark glassmorphism style matching the cockpit HUD aesthetic.
 */
export function OrbFormDialog({
  open,
  onClose,
  mode,
  nodeType,
  parentId,
  initialData,
  onSubmit,
}: OrbFormDialogProps) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens or initialData changes
  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        setLabel(initialData.label);
        setColor(initialData.color);
        setDescription(initialData.description || "");
        setPriority(initialData.priority || "medium");
      } else {
        setLabel("");
        setColor(COLOR_PALETTE[0]);
        setDescription("");
        setPriority("medium");
      }
      setSubmitting(false);
      // Focus the name input after a small delay for animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, mode, initialData]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !submitting) {
        onClose();
      }
    },
    [open, onClose, submitting],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!label.trim() || submitting) return;

    setSubmitting(true);
    try {
      const success = await onSubmit({
        label: label.trim(),
        color,
        description: description.trim() || undefined,
        priority,
      });
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error("[OrbFormDialog] Submit failed:", {
        error: error instanceof Error ? error.message : String(error),
        mode,
        nodeType,
        parentId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  if (!open) return null;

  const typeName = TYPE_NAME_MAP[nodeType];
  const title =
    mode === "create"
      ? `Nowy ${typeName}`
      : `Edytuj ${initialData?.label || typeName}`;
  const isValid = label.trim().length > 0;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 100,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md flex flex-col gap-5"
        style={{
          background: "rgba(10, 10, 28, 0.95)",
          border: "1px solid rgba(6, 182, 212, 0.2)",
          borderRadius: 12,
          padding: 24,
          boxShadow:
            "0 0 40px rgba(6, 182, 212, 0.08), 0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Title */}
        <h2
          className="font-mono text-base font-bold tracking-wide"
          style={{ color: "rgba(255, 255, 255, 0.9)" }}
        >
          {title}
        </h2>

        {/* Nazwa (Label) */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "rgba(255, 255, 255, 0.5)" }}
          >
            Nazwa
          </label>
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. Zdrowie, Praca..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) handleSubmit();
            }}
            className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.9)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.5)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          />
        </div>

        {/* Kolor (Color picker) */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "rgba(255, 255, 255, 0.5)" }}
          >
            Kolor
          </label>
          <div className="flex items-center gap-2.5">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="flex-shrink-0 rounded-full transition-transform hover:scale-110"
                style={{
                  width: 28,
                  height: 28,
                  background: c,
                  border:
                    color === c
                      ? `2px solid rgba(255, 255, 255, 0.9)`
                      : "2px solid transparent",
                  boxShadow:
                    color === c ? `0 0 0 2px ${c}, 0 0 12px ${c}60` : "none",
                  cursor: "pointer",
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Opis (Description) */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "rgba(255, 255, 255, 0.5)" }}
          >
            Opis
            <span
              className="ml-1.5 text-xs"
              style={{ color: "rgba(255, 255, 255, 0.25)" }}
            >
              (opcjonalny)
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md px-3 py-2 text-sm outline-none resize-none transition-colors"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.9)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.5)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            }}
          />
        </div>

        {/* Priorytet (Priority) */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "rgba(255, 255, 255, 0.5)" }}
          >
            Priorytet
          </label>
          <div className="flex items-center gap-2">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.value;
              const pillColors: Record<
                string,
                { bg: string; border: string; text: string }
              > = {
                low: {
                  bg: isSelected ? "rgba(107, 114, 128, 0.3)" : "transparent",
                  border: isSelected
                    ? "rgba(107, 114, 128, 0.6)"
                    : "rgba(255, 255, 255, 0.1)",
                  text: isSelected ? "#9ca3af" : "rgba(255, 255, 255, 0.35)",
                },
                medium: {
                  bg: isSelected ? "rgba(6, 182, 212, 0.15)" : "transparent",
                  border: isSelected
                    ? "rgba(6, 182, 212, 0.5)"
                    : "rgba(255, 255, 255, 0.1)",
                  text: isSelected ? "#06b6d4" : "rgba(255, 255, 255, 0.35)",
                },
                high: {
                  bg: isSelected ? "rgba(245, 158, 11, 0.2)" : "transparent",
                  border: isSelected
                    ? "rgba(245, 158, 11, 0.6)"
                    : "rgba(255, 255, 255, 0.1)",
                  text: isSelected ? "#f59e0b" : "rgba(255, 255, 255, 0.35)",
                },
              };
              const style = pillColors[p.value];

              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    color: style.text,
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          {/* Anuluj (Cancel) */}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.5)",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)";
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.75)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
            }}
          >
            Anuluj
          </button>

          {/* Zapisz (Save) */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-md px-5 py-2 text-sm font-semibold transition-all"
            style={{
              background:
                !isValid || submitting
                  ? "rgba(6, 182, 212, 0.15)"
                  : "rgba(6, 182, 212, 0.85)",
              border: "1px solid rgba(6, 182, 212, 0.4)",
              color:
                !isValid || submitting ? "rgba(6, 182, 212, 0.4)" : "#ffffff",
              cursor: !isValid || submitting ? "not-allowed" : "pointer",
              boxShadow:
                isValid && !submitting
                  ? "0 0 16px rgba(6, 182, 212, 0.2)"
                  : "none",
            }}
            onMouseEnter={(e) => {
              if (isValid && !submitting) {
                e.currentTarget.style.background = "rgba(6, 182, 212, 1)";
                e.currentTarget.style.boxShadow =
                  "0 0 24px rgba(6, 182, 212, 0.35)";
              }
            }}
            onMouseLeave={(e) => {
              if (isValid && !submitting) {
                e.currentTarget.style.background = "rgba(6, 182, 212, 0.85)";
                e.currentTarget.style.boxShadow =
                  "0 0 16px rgba(6, 182, 212, 0.2)";
              }
            }}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner />
                Zapisywanie...
              </span>
            ) : (
              "Zapisz"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small spinning indicator for submit button */
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={12}
        cy={12}
        r={10}
        stroke="currentColor"
        strokeWidth={3}
        strokeDasharray="60 30"
        strokeLinecap="round"
      />
    </svg>
  );
}
