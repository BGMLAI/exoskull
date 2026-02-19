"use client";

import { useState, useEffect, useCallback } from "react";
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

interface OrbDeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  nodeLabel: string;
  nodeType: OrbNodeType;
  onConfirm: () => Promise<boolean>;
}

/**
 * OrbDeleteConfirm — Confirmation dialog for deleting an orb.
 * Dark glassmorphism style with red destructive accent.
 */
export function OrbDeleteConfirm({
  open,
  onClose,
  nodeLabel,
  nodeType,
  onConfirm,
}: OrbDeleteConfirmProps) {
  const [submitting, setSubmitting] = useState(false);

  // Reset submitting state when dialog opens
  useEffect(() => {
    if (open) {
      setSubmitting(false);
    }
  }, [open]);

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

  // Handle confirm
  const handleConfirm = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const success = await onConfirm();
      if (success) {
        onClose();
      }
    } catch (error) {
      console.error("[OrbDeleteConfirm] Delete failed:", {
        error: error instanceof Error ? error.message : String(error),
        nodeLabel,
        nodeType,
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
        className="w-full max-w-sm flex flex-col gap-5"
        style={{
          background: "hsl(var(--card) / 0.95)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderRadius: 12,
          padding: 24,
          boxShadow:
            "0 0 40px rgba(239, 68, 68, 0.06), 0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Warning icon */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center flex-shrink-0 rounded-full"
            style={{
              width: 40,
              height: 40,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1={12} y1={9} x2={12} y2={13} />
              <line x1={12} y1={17} x2={12.01} y2={17} />
            </svg>
          </div>

          {/* Title */}
          <h2
            className="font-mono text-base font-bold tracking-wide"
            style={{ color: "rgba(239, 68, 68, 0.9)" }}
          >
            Usuń {typeName}
          </h2>
        </div>

        {/* Message */}
        <p
          className="text-sm leading-relaxed"
          style={{ color: "rgba(255, 255, 255, 0.6)" }}
        >
          Czy na pewno chcesz usunąć{" "}
          <strong style={{ color: "rgba(255, 255, 255, 0.9)" }}>
            {nodeLabel}
          </strong>
          ? Ta operacja jest nieodwracalna.
        </p>

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

          {/* Usuń (Delete) */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-md px-5 py-2 text-sm font-semibold transition-all"
            style={{
              background: submitting
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(239, 68, 68, 0.8)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: submitting ? "rgba(239, 68, 68, 0.4)" : "#ffffff",
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: !submitting
                ? "0 0 16px rgba(239, 68, 68, 0.15)"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.background = "rgba(239, 68, 68, 1)";
                e.currentTarget.style.boxShadow =
                  "0 0 24px rgba(239, 68, 68, 0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (!submitting) {
                e.currentTarget.style.background = "rgba(239, 68, 68, 0.8)";
                e.currentTarget.style.boxShadow =
                  "0 0 16px rgba(239, 68, 68, 0.15)";
              }
            }}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner />
                Usuwanie...
              </span>
            ) : (
              "Usuń"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small spinning indicator for delete button */
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
