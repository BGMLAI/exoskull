/**
 * Console + file logging
 */

import fs from "node:fs";
import { paths, ensureConfigDir } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = "info";
let logToFile = false;

export function configureLogger(options: {
  level?: LogLevel;
  file?: boolean;
}): void {
  if (options.level) minLevel = options.level;
  if (options.file !== undefined) logToFile = options.file;
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

function writeToFile(line: string): void {
  if (!logToFile) return;
  try {
    ensureConfigDir();
    fs.appendFileSync(paths.logFile, line + "\n", "utf-8");
  } catch {
    // Silent fail for file logging
  }
}

function log(level: LogLevel, tag: string, message: string, data?: any): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const formatted = formatMessage(level, tag, message);
  const dataStr = data ? " " + JSON.stringify(data) : "";

  writeToFile(formatted + dataStr);

  // Console output (only in non-daemon mode, or always for errors)
  if (level === "error") {
    console.error(formatted, data || "");
  } else if (level === "warn") {
    console.warn(formatted, data || "");
  } else {
    console.log(formatted, data || "");
  }
}

export const logger = {
  debug: (tag: string, msg: string, data?: any) => log("debug", tag, msg, data),
  info: (tag: string, msg: string, data?: any) => log("info", tag, msg, data),
  warn: (tag: string, msg: string, data?: any) => log("warn", tag, msg, data),
  error: (tag: string, msg: string, data?: any) => log("error", tag, msg, data),
};
