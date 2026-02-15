/**
 * Configuration management (~/.exoskull/config.yaml)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "yaml";

export interface FolderConfig {
  path: string;
  category: string;
  recursive: boolean;
  filters?: {
    include?: string[];
    exclude?: string[];
  };
}

export interface UploadConfig {
  concurrent: number;
  retry_attempts: number;
  multipart_threshold_mb: number;
}

export interface AppConfig {
  api_url: string;
  folders: FolderConfig[];
  upload: UploadConfig;
}

const CONFIG_DIR = path.join(os.homedir(), ".exoskull");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");
const PID_FILE = path.join(CONFIG_DIR, "daemon.pid");
const LOG_FILE = path.join(CONFIG_DIR, "agent.log");
const DB_FILE = path.join(CONFIG_DIR, "state.db");

export const paths = {
  configDir: CONFIG_DIR,
  configFile: CONFIG_FILE,
  credentialsFile: CREDENTIALS_FILE,
  pidFile: PID_FILE,
  logFile: LOG_FILE,
  dbFile: DB_FILE,
};

const DEFAULT_CONFIG: AppConfig = {
  api_url: "https://exoskull.xyz",
  folders: [],
  upload: {
    concurrent: 3,
    retry_attempts: 5,
    multipart_threshold_mb: 50,
  },
};

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  const parsed = parse(raw) as Partial<AppConfig>;

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    upload: { ...DEFAULT_CONFIG.upload, ...parsed.upload },
    folders: parsed.folders || [],
  };
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, stringify(config), "utf-8");
}

export function addFolder(
  folderPath: string,
  options: { category?: string; recursive?: boolean; include?: string[]; exclude?: string[] } = {},
): AppConfig {
  const config = loadConfig();
  const resolved = path.resolve(folderPath);

  // Check if already exists
  const existing = config.folders.find((f) => path.resolve(f.path) === resolved);
  if (existing) {
    throw new Error(`Folder already watched: ${resolved}`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Folder does not exist: ${resolved}`);
  }

  config.folders.push({
    path: resolved,
    category: options.category || "other",
    recursive: options.recursive !== false,
    filters: {
      include: options.include || ["*.pdf", "*.docx", "*.doc", "*.txt", "*.md", "*.csv", "*.json", "*.xlsx", "*.xls", "*.pptx", "*.ppt"],
      exclude: options.exclude || ["~$*", "*.tmp", "*.bak", ".DS_Store", "Thumbs.db"],
    },
  });

  saveConfig(config);
  return config;
}

export function removeFolder(folderPath: string): AppConfig {
  const config = loadConfig();
  const resolved = path.resolve(folderPath);
  const before = config.folders.length;

  config.folders = config.folders.filter(
    (f) => path.resolve(f.path) !== resolved,
  );

  if (config.folders.length === before) {
    throw new Error(`Folder not in watchlist: ${resolved}`);
  }

  saveConfig(config);
  return config;
}

// Credentials management
export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  email: string;
}

export function loadCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;

  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
  // Restrict permissions on credentials file
  try {
    fs.chmodSync(CREDENTIALS_FILE, 0o600);
  } catch {
    // chmod may not work on Windows - that's OK
  }
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}
