/**
 * JSON file-based state store for file sync tracking
 *
 * Uses ~/.exoskull/state.json instead of SQLite to avoid native compilation issues.
 * Same interface — just a different backend.
 */

import fs from "node:fs";
import { paths, ensureConfigDir } from "./config.js";

export interface SyncedFile {
  file_path: string;
  file_hash: string;
  file_size: number;
  document_id: string | null;
  status: "pending" | "uploading" | "synced" | "failed" | "skipped";
  watched_folder: string;
  error_message: string | null;
  synced_at: string | null;
  created_at: string;
}

interface StateData {
  files: Record<string, SyncedFile>;
}

const STATE_FILE = paths.dbFile.replace(".db", ".json");

let state: StateData | null = null;
let saveTimer: NodeJS.Timeout | null = null;

function load(): StateData {
  if (state) return state;

  ensureConfigDir();

  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      state = JSON.parse(raw) as StateData;
    } catch {
      state = { files: {} };
    }
  } else {
    state = { files: {} };
  }

  return state;
}

function save(): void {
  // Debounce saves to avoid excessive disk I/O
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveImmediate();
  }, 500);
}

function saveImmediate(): void {
  if (!state) return;
  ensureConfigDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// Public API (matches the old SQLite interface)

export function getDb(): void {
  load();
}

export function closeDb(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (state) {
    saveImmediate();
    state = null;
  }
}

export function needsSync(filePath: string, fileHash: string): boolean {
  const data = load();
  const entry = data.files[filePath];

  if (!entry) return true; // Never seen
  if (entry.file_hash !== fileHash) return true; // File changed
  if (entry.status === "failed") return true; // Previous attempt failed
  return false;
}

export function hashExists(fileHash: string): string | null {
  const data = load();
  for (const entry of Object.values(data.files)) {
    if (entry.file_hash === fileHash && entry.status === "synced" && entry.document_id) {
      return entry.document_id;
    }
  }
  return null;
}

export function upsertFile(filePath: string, data: Partial<SyncedFile>): void {
  const store = load();
  const existing = store.files[filePath];

  if (existing) {
    store.files[filePath] = { ...existing, ...data, file_path: filePath };
  } else {
    store.files[filePath] = {
      file_path: filePath,
      file_hash: data.file_hash || "",
      file_size: data.file_size || 0,
      document_id: data.document_id || null,
      status: data.status || "pending",
      watched_folder: data.watched_folder || "",
      error_message: data.error_message || null,
      synced_at: data.synced_at || null,
      created_at: new Date().toISOString(),
    };
  }

  save();
}

export function markSynced(filePath: string, documentId: string): void {
  const store = load();
  const entry = store.files[filePath];
  if (entry) {
    entry.status = "synced";
    entry.document_id = documentId;
    entry.synced_at = new Date().toISOString();
    entry.error_message = null;
    save();
  }
}

export function markFailed(filePath: string, error: string): void {
  const store = load();
  const entry = store.files[filePath];
  if (entry) {
    entry.status = "failed";
    entry.error_message = error;
    save();
  }
}

export interface SyncStats {
  total: number;
  synced: number;
  pending: number;
  uploading: number;
  failed: number;
  skipped: number;
}

export function getStats(): SyncStats {
  const data = load();
  const stats: SyncStats = {
    total: 0,
    synced: 0,
    pending: 0,
    uploading: 0,
    failed: 0,
    skipped: 0,
  };

  for (const entry of Object.values(data.files)) {
    stats.total++;
    if (entry.status in stats) {
      (stats as any)[entry.status]++;
    }
  }

  return stats;
}

export function getFailedFiles(): SyncedFile[] {
  const data = load();
  return Object.values(data.files)
    .filter((f) => f.status === "failed")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);
}

export function getRecentFiles(limit: number = 10): SyncedFile[] {
  const data = load();
  return Object.values(data.files)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
