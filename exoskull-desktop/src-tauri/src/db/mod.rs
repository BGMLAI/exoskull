pub mod migrations;
pub mod models;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let data_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".exoskull");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("exoskull.db")
}

pub fn initialize(db_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open(db_path)?;

    // Enable WAL mode for better concurrent access
    // journal_mode returns a row, so use query_row instead of execute/pragma_update
    let _: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // Run migrations
    migrations::run(&conn)?;

    log::info!("Database initialized at {:?}", db_path);
    Ok(())
}

pub fn open(db_path: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let _: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}
