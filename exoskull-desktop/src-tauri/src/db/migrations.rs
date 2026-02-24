use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // V1: Core tables
    "CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Auth
    "CREATE TABLE IF NOT EXISTS auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token TEXT,
        tenant_id TEXT,
        user_email TEXT,
        expires_at TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Recall entries
    "CREATE TABLE IF NOT EXISTS recall_entries (
        id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        app_name TEXT,
        window_title TEXT,
        ocr_text TEXT,
        image_path TEXT NOT NULL,
        thumbnail_path TEXT,
        image_hash TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Recall FTS index
    "CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts USING fts5(
        ocr_text, window_title, app_name,
        content=recall_entries, content_rowid=id
    );",
    // V1: Recall triggers for FTS sync
    "CREATE TRIGGER IF NOT EXISTS recall_ai AFTER INSERT ON recall_entries BEGIN
        INSERT INTO recall_fts(rowid, ocr_text, window_title, app_name)
        VALUES (new.id, new.ocr_text, new.window_title, new.app_name);
    END;",
    "CREATE TRIGGER IF NOT EXISTS recall_ad AFTER DELETE ON recall_entries BEGIN
        INSERT INTO recall_fts(recall_fts, rowid, ocr_text, window_title, app_name)
        VALUES ('delete', old.id, old.ocr_text, old.window_title, old.app_name);
    END;",
    "CREATE TRIGGER IF NOT EXISTS recall_au AFTER UPDATE ON recall_entries BEGIN
        INSERT INTO recall_fts(recall_fts, rowid, ocr_text, window_title, app_name)
        VALUES ('delete', old.id, old.ocr_text, old.window_title, old.app_name);
        INSERT INTO recall_fts(rowid, ocr_text, window_title, app_name)
        VALUES (new.id, new.ocr_text, new.window_title, new.app_name);
    END;",
    // V1: Upload queue
    "CREATE TABLE IF NOT EXISTS upload_queue (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'pending',
        retries INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        uploaded_at TEXT
    );",
    // V1: Watched folders
    "CREATE TABLE IF NOT EXISTS watched_folders (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Recall exclusions
    "CREATE TABLE IF NOT EXISTS recall_exclusions (
        id INTEGER PRIMARY KEY,
        pattern TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'app_name',
        created_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Offline cache for API data
    "CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    );",
    // V1: Schema version
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '1');",
    // V1: Default settings
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('recall_enabled', 'false');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('recall_interval_secs', '30');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('recall_storage_mode', 'local');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('mouse_button_dictation', '4');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('mouse_button_tts', '5');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('mouse_button_chat', '3');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('tts_provider', 'system');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_start', 'false');",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');",
];

pub fn run(conn: &Connection) -> Result<(), rusqlite::Error> {
    for migration in MIGRATIONS {
        conn.execute_batch(migration)?;
    }
    log::info!("Database migrations complete");
    Ok(())
}
