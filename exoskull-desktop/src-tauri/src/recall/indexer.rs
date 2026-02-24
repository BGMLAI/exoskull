use crate::db;
use crate::db::models::{RecallEntry, RecallSearchResult};
use rusqlite::params;
use std::path::PathBuf;

pub fn insert_entry(
    db_path: &PathBuf,
    timestamp: &str,
    app_name: Option<&str>,
    window_title: Option<&str>,
    ocr_text: Option<&str>,
    image_path: &str,
    thumbnail_path: Option<&str>,
    image_hash: &str,
) -> Result<i64, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    conn.execute(
        "INSERT INTO recall_entries (timestamp, app_name, window_title, ocr_text, image_path, thumbnail_path, image_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![timestamp, app_name, window_title, ocr_text, image_path, thumbnail_path, image_hash],
    )
    .map_err(|e| format!("Insert failed: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn search(db_path: &PathBuf, query: &str, limit: i64) -> Result<Vec<RecallSearchResult>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.timestamp, r.app_name, r.window_title, r.ocr_text,
                    r.image_path, r.thumbnail_path, rank, snippet(recall_fts, 0, '<mark>', '</mark>', '...', 32)
             FROM recall_fts f
             JOIN recall_entries r ON r.id = f.rowid
             WHERE recall_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let results = stmt
        .query_map(params![query, limit], |row| {
            Ok(RecallSearchResult {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                app_name: row.get(2)?,
                window_title: row.get(3)?,
                ocr_text: row.get(4)?,
                image_path: row.get(5)?,
                thumbnail_path: row.get(6)?,
                rank: row.get(7)?,
                snippet: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut entries = Vec::new();
    for result in results {
        entries.push(result.map_err(|e| format!("Row read failed: {}", e))?);
    }

    Ok(entries)
}

pub fn get_timeline(
    db_path: &PathBuf,
    date: Option<&str>,
    app_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<RecallEntry>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let mut sql = String::from(
        "SELECT id, timestamp, app_name, window_title, ocr_text, image_path, thumbnail_path, synced
         FROM recall_entries WHERE 1=1",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(d) = date {
        sql.push_str(" AND timestamp LIKE ?");
        param_values.push(Box::new(format!("{}%", d)));
    }

    if let Some(app) = app_filter {
        sql.push_str(" AND app_name LIKE ?");
        param_values.push(Box::new(format!("%{}%", app)));
    }

    sql.push_str(" ORDER BY timestamp DESC LIMIT ? OFFSET ?");
    param_values.push(Box::new(limit));
    param_values.push(Box::new(offset));

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare failed: {}", e))?;
    let results = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(RecallEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                app_name: row.get(2)?,
                window_title: row.get(3)?,
                ocr_text: row.get(4)?,
                image_path: row.get(5)?,
                thumbnail_path: row.get(6)?,
                synced: row.get::<_, i32>(7)? != 0,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut entries = Vec::new();
    for result in results {
        entries.push(result.map_err(|e| format!("Row read failed: {}", e))?);
    }

    Ok(entries)
}

pub fn get_unsynced(db_path: &PathBuf, limit: i64) -> Result<Vec<RecallEntry>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, app_name, window_title, ocr_text, image_path, thumbnail_path, synced
             FROM recall_entries WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?1",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let results = stmt
        .query_map(params![limit], |row| {
            Ok(RecallEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                app_name: row.get(2)?,
                window_title: row.get(3)?,
                ocr_text: row.get(4)?,
                image_path: row.get(5)?,
                thumbnail_path: row.get(6)?,
                synced: row.get::<_, i32>(7)? != 0,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut entries = Vec::new();
    for result in results {
        entries.push(result.map_err(|e| format!("Row read failed: {}", e))?);
    }

    Ok(entries)
}

pub fn mark_synced(db_path: &PathBuf, id: i64) -> Result<(), String> {
    let conn = db::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    conn.execute("UPDATE recall_entries SET synced = 1 WHERE id = ?1", params![id])
        .map_err(|e| format!("Update failed: {}", e))?;
    Ok(())
}
