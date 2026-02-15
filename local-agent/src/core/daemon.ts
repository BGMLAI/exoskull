/**
 * Daemon management (PID file, background process)
 */

import fs from "node:fs";
import { spawn } from "node:child_process";
import { paths } from "./config.js";

export function isRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;

  try {
    // Sending signal 0 checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist — clean up stale PID file
    removePid();
    return false;
  }
}

export function readPid(): number | null {
  try {
    const content = fs.readFileSync(paths.pidFile, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  fs.writeFileSync(paths.pidFile, String(pid), "utf-8");
}

export function removePid(): void {
  try {
    fs.unlinkSync(paths.pidFile);
  } catch {
    // Already gone
  }
}

export function startDaemon(): number {
  if (isRunning()) {
    const pid = readPid()!;
    throw new Error(`Daemon already running (PID ${pid})`);
  }

  const child = spawn(process.execPath, [process.argv[1], "_daemon"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, EXO_DAEMON: "1" },
  });

  child.unref();

  if (child.pid) {
    writePid(child.pid);
    return child.pid;
  }

  throw new Error("Failed to start daemon: no PID returned");
}

export function stopDaemon(): boolean {
  const pid = readPid();
  if (!pid) return false;

  try {
    process.kill(pid, "SIGTERM");
    removePid();
    return true;
  } catch {
    removePid();
    return false;
  }
}
