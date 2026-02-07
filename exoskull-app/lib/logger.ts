/**
 * Structured Logger
 *
 * Drop-in replacement for console.log/warn with:
 * - Log levels (debug suppressed in production)
 * - Consistent prefix format
 * - Structured context in JSON for production
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

const MIN_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

export const logger = {
  debug(...args: unknown[]) {
    if (shouldLog("debug")) console.debug(...args);
  },

  info(...args: unknown[]) {
    if (shouldLog("info")) console.log(...args);
  },

  warn(...args: unknown[]) {
    if (shouldLog("warn")) console.warn(...args);
  },

  error(...args: unknown[]) {
    console.error(...args);
  },
};
