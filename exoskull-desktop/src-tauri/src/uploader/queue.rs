use crate::db;
use crate::db::models::UploadQueueItem;
use rusqlite::params;
use std::path::PathBuf;

pub fn enqueue(db_path: &PathBuf, file_path: &str, file_name: &str) -> Result<i64, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let file_size = std::fs::metadata(file_path)
        .map(|m| m.len() as i64)
        .ok();

    conn.execute(
        "INSERT INTO upload_queue (file_path, file_name, file_size, status) VALUES (?1, ?2, ?3, 'pending')",
        params![file_path, file_name, file_size],
    )
    .map_err(|e| format!("Enqueue failed: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn get_pending(db_path: &PathBuf, limit: i64) -> Result<Vec<UploadQueueItem>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, file_name, file_size, status, retries, error, created_at, uploaded_at
             FROM upload_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?1",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let results = stmt
        .query_map(params![limit], |row| {
            Ok(UploadQueueItem {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                retries: row.get(5)?,
                error: row.get(6)?,
                created_at: row.get(7)?,
                uploaded_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut items = Vec::new();
    for result in results {
        items.push(result.map_err(|e| format!("Row read failed: {}", e))?);
    }
    Ok(items)
}

pub fn mark_uploaded(db_path: &PathBuf, id: i64) -> Result<(), String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    conn.execute(
        "UPDATE upload_queue SET status = 'uploaded', uploaded_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Update failed: {}", e))?;
    Ok(())
}

pub fn mark_failed(db_path: &PathBuf, id: i64, error: &str) -> Result<(), String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    conn.execute(
        "UPDATE upload_queue SET status = 'failed', retries = retries + 1, error = ?2 WHERE id = ?1",
        params![id, error],
    )
    .map_err(|e| format!("Update failed: {}", e))?;
    Ok(())
}

pub fn retry_failed(db_path: &PathBuf, max_retries: i32) -> Result<u32, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    let count = conn
        .execute(
            "UPDATE upload_queue SET status = 'pending' WHERE status = 'failed' AND retries < ?1",
            params![max_retries],
        )
        .map_err(|e| format!("Retry failed: {}", e))?;
    Ok(count as u32)
}

pub fn get_all(db_path: &PathBuf, limit: i64) -> Result<Vec<UploadQueueItem>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, file_name, file_size, status, retries, error, created_at, uploaded_at
             FROM upload_queue ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let results = stmt
        .query_map(params![limit], |row| {
            Ok(UploadQueueItem {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                retries: row.get(5)?,
                error: row.get(6)?,
                created_at: row.get(7)?,
                uploaded_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut items = Vec::new();
    for result in results {
        items.push(result.map_err(|e| format!("Row read failed: {}", e))?);
    }
    Ok(items)
}
