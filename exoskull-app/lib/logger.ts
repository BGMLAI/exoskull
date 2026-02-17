/**
 * Structured Logger
 *
 * Features:
 * - Level-based filtering (debug suppressed in production)
 * - Structured JSON output in production (for Vercel log drains)
 * - Plain console output in development
 * - Request context support (requestId, tenantId)
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("[Gateway] Inbound message", { from, channel });
 *   logger.debug("[ETL] Processing row", { id });
 *   logger.warn("[CircuitBreaker] Half-open", { service });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const IS_PROD = process.env.NODE_ENV === "production";
const MIN_LEVEL: LogLevel = IS_PROD ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

/**
 * In production, output structured JSON for log drain ingestion.
 * In development, use plain console for readability.
 */
function emit(level: LogLevel, args: unknown[]) {
  if (!shouldLog(level)) return;

  if (IS_PROD) {
    // Extract first string arg as message, rest as context
    const message = typeof args[0] === "string" ? args[0] : "";
    const context =
      args.length > 1 && typeof args[args.length - 1] === "object"
        ? (args[args.length - 1] as Record<string, unknown>)
        : undefined;

    const entry: Record<string, unknown> = {
      level,
      ts: new Date().toISOString(),
      msg: message,
    };
    if (context) Object.assign(entry, context);

    // Use appropriate console method for Vercel log level detection
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    fn(JSON.stringify(entry));
  } else {
    // Dev: plain console
    const fn =
      level === "debug"
        ? console.debug
        : level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : console.log;
    fn(...args);
  }
}

export const logger = {
  debug(...args: unknown[]) {
    emit("debug", args);
  },
  info(...args: unknown[]) {
    emit("info", args);
  },
  warn(...args: unknown[]) {
    emit("warn", args);
  },
  error(...args: unknown[]) {
    emit("error", args);
  },
};
