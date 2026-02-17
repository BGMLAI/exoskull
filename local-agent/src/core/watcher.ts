/**
 * Chokidar file watcher - watches configured folders and queues uploads
 */

import { watch, type FSWatcher } from "chokidar";
import path from "node:path";
import fs from "node:fs";
import { loadConfig, type FolderConfig } from "./config.js";
import { needsSync } from "./state.js";
import { hashFile } from "../utils/file-hash.js";
import { isSupported } from "../utils/mime-types.js";
import { uploadFile } from "./uploader.js";
import { logger } from "./logger.js";

const TAG = "Watcher";

let watcher: FSWatcher | null = null;
let debounceTimers = new Map<string, NodeJS.Timeout>();

const DEBOUNCE_MS = 2000;

function matchesFilter(
  filePath: string,
  filters?: FolderConfig["filters"],
): boolean {
  if (!filters) return true;

  const filename = path.basename(filePath);

  // Check excludes first
  if (filters.exclude) {
    for (const pattern of filters.exclude) {
      if (matchGlob(filename, pattern)) return false;
    }
  }

  // Check includes
  if (filters.include && filters.include.length > 0) {
    for (const pattern of filters.include) {
      if (matchGlob(filename, pattern)) return true;
    }
    return false; // Has include filters but none matched
  }

  return true;
}

function matchGlob(filename: string, pattern: string): boolean {
  // Simple glob: *.ext, ~$*, etc.
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`, "i").test(filename);
}

function findFolderConfig(filePath: string, folders: FolderConfig[]): FolderConfig | null {
  const resolved = path.resolve(filePath);
  for (const folder of folders) {
    const folderResolved = path.resolve(folder.path);
    if (resolved.startsWith(folderResolved + path.sep) || resolved.startsWith(folderResolved + "/")) {
      return folder;
    }
  }
  return null;
}

async function handleFileChange(filePath: string): Promise<void> {
  const config = loadConfig();
  const folderConfig = findFolderConfig(filePath, config.folders);

  if (!folderConfig) return;
  if (!isSupported(filePath)) return;
  if (!matchesFilter(filePath, folderConfig.filters)) return;

  // Verify file still exists and is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    return;
  }

  // Check if needs syncing
  try {
    const hash = await hashFile(filePath);
    if (!needsSync(filePath, hash)) {
      logger.debug(TAG, `Skipping (already synced): ${path.basename(filePath)}`);
      return;
    }
  } catch (error) {
    logger.error(TAG, `Hash failed: ${filePath}`, {
      error: error instanceof Error ? error.message : error,
    });
    return;
  }

  // Upload
  await uploadFile(filePath, folderConfig.path, folderConfig.category);
}

function debouncedHandle(filePath: string): void {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath);
      handleFileChange(filePath).catch((err) => {
        logger.error(TAG, `Unhandled error processing: ${filePath}`, {
          error: err instanceof Error ? err.message : err,
        });
      });
    }, DEBOUNCE_MS),
  );
}

export function startWatching(): FSWatcher {
  const config = loadConfig();

  if (config.folders.length === 0) {
    logger.warn(TAG, "No folders configured. Use: exo-agent add <folder>");
    // Return a dummy watcher that watches nothing
    watcher = watch([], { persistent: true });
    return watcher;
  }

  const watchPaths = config.folders.map((f) => path.resolve(f.path));
  logger.info(TAG, `Watching ${watchPaths.length} folder(s):`);
  for (const p of watchPaths) {
    logger.info(TAG, `  - ${p}`);
  }

  watcher = watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
    ignored: [
      /(^|[\/\\])\../, // Hidden files/dirs
      /node_modules/,
      /\.git/,
      /\.next/,
      /\bdist\b/,
      /__pycache__/,
      /\.cache/,
      /\.vscode/,
      /\.idea/,
      /AppData/,
      /\$RECYCLE\.BIN/,
      /System Volume Information/,
      /\.Trash/,
      /__MACOSX/,
      /\.tox/,
      /\.mypy_cache/,
      /\.pytest_cache/,
      /\.parcel-cache/,
      /\.turbo/,
      /Program Files/,
      /WindowsApps/,
      /WpSystem/,
      /WUDownloadCache/,
      /Windows[\/\\]/,
      /\bsteam\b/i,
      /\bNintendo\b/i,
      /\bInstallers\b/i,
    ],
  });

  watcher.on("add", (filePath) => debouncedHandle(filePath));
  watcher.on("change", (filePath) => debouncedHandle(filePath));

  watcher.on("error", (error) => {
    logger.error(TAG, "Watcher error", {
      error: error instanceof Error ? error.message : error,
    });
  });

  return watcher;
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  logger.info(TAG, "Stopped watching");
}

export function isWatching(): boolean {
  return watcher !== null;
}
