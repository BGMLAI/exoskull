/**
 * Canvas Widget Registry
 *
 * Maps widget_type strings to component metadata.
 * Used by CanvasGrid to resolve what to render for each widget.
 *
 * Components are loaded dynamically in CanvasGrid (not here)
 * to avoid circular dependencies with React components.
 */

import type { WidgetMeta } from "./types";

/** Metadata for all built-in widget types */
export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  voice_hero: {
    type: "voice_hero",
    label: "Voice Hero",
    icon: "Mic",
    defaultSize: { w: 4, h: 2 },
    minSize: { w: 4, h: 2 },
    category: "core",
  },
  health: {
    type: "health",
    label: "Zdrowie",
    icon: "Heart",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "health",
  },
  tasks: {
    type: "tasks",
    label: "Zadania",
    icon: "CheckSquare",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "productivity",
  },
  calendar: {
    type: "calendar",
    label: "Kalendarz",
    icon: "Calendar",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "productivity",
  },
  conversations: {
    type: "conversations",
    label: "Rozmowy",
    icon: "MessageSquare",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "core",
  },
  emotional: {
    type: "emotional",
    label: "Nastroj",
    icon: "Brain",
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "health",
  },
  guardian: {
    type: "guardian",
    label: "Guardian",
    icon: "Shield",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "iors",
  },
  quick_actions: {
    type: "quick_actions",
    label: "Szybkie akcje",
    icon: "Zap",
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "core",
  },
  integrations: {
    type: "integrations",
    label: "Polaczone serwisy",
    icon: "Link",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "core",
  },
  email_inbox: {
    type: "email_inbox",
    label: "Email Analytics",
    icon: "Mail",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "productivity",
  },
  knowledge: {
    type: "knowledge",
    label: "Wiedza",
    icon: "BookOpen",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "core",
  },
  iors_status: {
    type: "iors_status",
    label: "IORS Status",
    icon: "Bot",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    category: "iors",
  },
  activity_feed: {
    type: "activity_feed",
    label: "Aktywnosc IORS",
    icon: "Activity",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  optimization: {
    type: "optimization",
    label: "Optymalizacja",
    icon: "TrendingUp",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  intervention_inbox: {
    type: "intervention_inbox",
    label: "Skrzynka interwencji",
    icon: "Inbox",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  insight_history: {
    type: "insight_history",
    label: "Historia insightow",
    icon: "Lightbulb",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  knowledge_insights: {
    type: "knowledge_insights",
    label: "Analiza wiedzy",
    icon: "Brain",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  value_tree: {
    type: "value_tree",
    label: "Drzewo wartosci",
    icon: "TreePine",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "core",
  },
  system_health: {
    type: "system_health",
    label: "Zdrowie systemu",
    icon: "HeartPulse",
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
  integration_health: {
    type: "integration_health",
    label: "Zdrowie integracji",
    icon: "Activity",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "core",
  },
  process_monitor: {
    type: "process_monitor",
    label: "Monitor procesow",
    icon: "Activity",
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    category: "iors",
  },
};

/** Get metadata for a widget type. Falls back to a generic entry for dynamic_mod types. */
export function getWidgetMeta(widgetType: string): WidgetMeta | null {
  if (WIDGET_REGISTRY[widgetType]) {
    return WIDGET_REGISTRY[widgetType];
  }

  // Dynamic mod widget
  if (widgetType.startsWith("dynamic_mod:")) {
    const slug = widgetType.replace("dynamic_mod:", "");
    return {
      type: widgetType,
      label: slug.replace(/-/g, " "),
      icon: "Package",
      defaultSize: { w: 2, h: 2 },
      minSize: { w: 1, h: 1 },
      category: "mod",
    };
  }

  // Generated app widget
  if (widgetType.startsWith("app:")) {
    const slug = widgetType.replace("app:", "");
    return {
      type: widgetType,
      label: slug.replace(/-/g, " "),
      icon: "LayoutGrid",
      defaultSize: { w: 2, h: 3 },
      minSize: { w: 2, h: 2 },
      category: "mod",
    };
  }

  return null;
}

/** Get all available widget types for the widget picker */
export function getAvailableWidgetTypes(): WidgetMeta[] {
  return Object.values(WIDGET_REGISTRY).filter(
    (w) => w.type !== "voice_hero", // voice_hero is auto-added, not user-selectable
  );
}
