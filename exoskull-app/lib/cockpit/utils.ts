/**
 * Shared cockpit utilities.
 * Extracted from components/3d/SpatialChat.tsx for reuse.
 */

/** Strip markdown formatting for plain-text display */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/```[\s\S]*?```/g, "[kod]")
    .replace(/`(.+?)`/g, "$1");
}

/** Truncate text with markdown stripped */
export function truncate(text: string, max: number): string {
  const cleaned = stripMarkdown(text);
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max) + "...";
}

/** Format a date string as relative time (e.g. "2h ago", "3d") */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}
