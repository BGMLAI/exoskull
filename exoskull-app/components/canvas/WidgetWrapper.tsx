"use client";

import { Component, type ReactNode } from "react";
import { X, GripVertical } from "lucide-react";

// ============================================================================
// ERROR BOUNDARY — Per-widget isolation
// ============================================================================

interface ErrorBoundaryProps {
  widgetType: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(
      `[WidgetWrapper] ${this.props.widgetType} crashed:`,
      error.message,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
          <p>Widget error. Refresh to retry.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// WIDGET WRAPPER
// ============================================================================

interface WidgetWrapperProps {
  widgetId: string;
  widgetType: string;
  pinned: boolean;
  onRemove: (id: string) => void;
  children: ReactNode;
}

export function WidgetWrapper({
  widgetId,
  widgetType,
  pinned,
  onRemove,
  children,
}: WidgetWrapperProps) {
  return (
    <div className="relative group h-full">
      {/* Drag handle — visible on hover, top-left */}
      {!pinned && (
        <div className="canvas-drag-handle absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded bg-background/80 backdrop-blur-sm">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}

      {/* Remove button — visible on hover, top-right */}
      {!pinned && (
        <button
          onClick={() => onRemove(widgetId)}
          className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 backdrop-blur-sm hover:bg-destructive/20"
          title="Usun widget"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      )}

      {/* Widget content with error boundary */}
      <WidgetErrorBoundary widgetType={widgetType}>
        <div className="h-full overflow-auto">{children}</div>
      </WidgetErrorBoundary>
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

export function WidgetSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/3" />
      <div className="h-3 bg-muted rounded w-2/3" />
      <div className="h-20 bg-muted rounded" />
    </div>
  );
}
