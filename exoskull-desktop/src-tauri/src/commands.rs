use crate::api::ExoSkullApi;
use crate::assistant::dictation::DictationEngine;
use crate::assistant::tts::TtsEngine;
use crate::db;
use crate::db::models::*;
use crate::recall::capture::CaptureEngine;
use crate::recall::indexer;
use rusqlite::params;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

// ========== State ==========

pub struct AppState {
    pub db_path: PathBuf,
    pub dictation: Mutex<DictationEngine>,
}

fn get_db_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".exoskull")
        .join("exoskull.db")
}

fn get_setting(db_path: &PathBuf, key: &str) -> Result<String, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB error: {}", e))?;
    let value: String = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Setting '{}' not found: {}", key, e))?;
    Ok(value)
}

fn set_setting(db_path: &PathBuf, key: &str, value: &str) -> Result<(), String> {
    let conn = db::open(db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        params![key, value],
    )
    .map_err(|e| format!("Set setting failed: {}", e))?;
    Ok(())
}

fn get_token(db_path: &PathBuf) -> Result<Option<String>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB error: {}", e))?;
    let token: Option<String> = conn
        .query_row("SELECT token FROM auth WHERE id = 1", [], |row| row.get(0))
        .ok();
    Ok(token)
}

fn is_jwt_expired(token: &str) -> bool {
    // Decode JWT payload (base64 middle part) to check exp
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return true;
    }
    // base64url decode
    let payload = parts[1];
    let padded = match payload.len() % 4 {
        2 => format!("{}==", payload),
        3 => format!("{}=", payload),
        _ => payload.to_string(),
    };
    let decoded = padded.replace('-', "+").replace('_', "/");
    if let Ok(bytes) = base64_decode(&decoded) {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(exp) = json.get("exp").and_then(|v| v.as_i64()) {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                // Refresh 60s before actual expiry
                return now >= (exp - 60);
            }
        }
    }
    true
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use std::collections::HashMap;
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let map: HashMap<u8, u8> = chars.bytes().enumerate().map(|(i, c)| (c, i as u8)).collect();
    let mut out = Vec::new();
    let bytes: Vec<u8> = input.bytes().filter(|&b| b != b'=').collect();
    for chunk in bytes.chunks(4) {
        let mut buf = 0u32;
        let mut count = 0;
        for &b in chunk {
            if let Some(&val) = map.get(&b) {
                buf = (buf << 6) | val as u32;
                count += 1;
            }
        }
        buf <<= (4 - count) * 6;
        if count >= 2 { out.push((buf >> 16) as u8); }
        if count >= 3 { out.push((buf >> 8) as u8); }
        if count >= 4 { out.push(buf as u8); }
    }
    Ok(out)
}

async fn get_valid_token(db_path: &PathBuf) -> Result<Option<String>, String> {
    let conn = db::open(db_path).map_err(|e| format!("DB error: {}", e))?;
    let auth_row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT token, refresh_token FROM auth WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    match auth_row {
        None => Ok(None),
        Some((token, refresh_token)) => {
            if !is_jwt_expired(&token) {
                return Ok(Some(token));
            }
            // Token expired — try refresh
            let rt = match refresh_token {
                Some(rt) if !rt.is_empty() => rt,
                _ => return Ok(None), // No refresh token, must re-login
            };
            log::info!("JWT expired, refreshing token...");
            let api = ExoSkullApi::new(None);
            match api.refresh_auth(&rt).await {
                Ok(response) => {
                    // Update stored tokens
                    let conn2 = db::open(db_path).map_err(|e| format!("DB error: {}", e))?;
                    conn2.execute(
                        "UPDATE auth SET token = ?1, refresh_token = ?2, updated_at = datetime('now') WHERE id = 1",
                        params![response.token, response.refresh_token],
                    ).map_err(|e| format!("Update token failed: {}", e))?;
                    log::info!("Token refreshed successfully");
                    Ok(Some(response.token))
                }
                Err(e) => {
                    log::error!("Token refresh failed: {}", e);
                    Ok(None) // Force re-login
                }
            }
        }
    }
}

// ========== Auth Commands ==========

#[tauri::command]
pub async fn login(email: String, password: String) -> Result<AuthState, String> {
    let db_path = get_db_path();
    let api = ExoSkullApi::new(None);
    let response = api.login(&email, &password).await?;

    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO auth (id, token, refresh_token, tenant_id, user_email, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, datetime('now'))",
        params![response.token, response.refresh_token, response.tenant_id, email],
    )
    .map_err(|e| format!("Save auth failed: {}", e))?;

    Ok(AuthState {
        token: Some(response.token),
        tenant_id: Some(response.tenant_id),
        user_email: Some(email),
        is_authenticated: true,
    })
}

#[tauri::command]
pub async fn logout() -> Result<(), String> {
    let db_path = get_db_path();
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute("DELETE FROM auth WHERE id = 1", [])
        .map_err(|e| format!("Logout failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_auth_status() -> Result<AuthState, String> {
    let db_path = get_db_path();
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let result = conn.query_row(
        "SELECT token, tenant_id, user_email FROM auth WHERE id = 1",
        [],
        |row| {
            Ok(AuthState {
                token: row.get(0)?,
                tenant_id: row.get(1)?,
                user_email: row.get(2)?,
                is_authenticated: true,
            })
        },
    );

    match result {
        Ok(state) => Ok(state),
        Err(_) => Ok(AuthState {
            token: None,
            tenant_id: None,
            user_email: None,
            is_authenticated: false,
        }),
    }
}

// ========== Chat Commands ==========

#[tauri::command]
pub async fn send_chat_message(message: String) -> Result<String, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://exoskull.xyz/api/chat/send")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "message": message,
        }))
        .send()
        .await
        .map_err(|e| format!("Chat error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Chat failed ({}): {}", status, body));
    }

    #[derive(serde::Deserialize)]
    struct ChatResponse {
        text: Option<String>,
        error: Option<String>,
    }

    let result: ChatResponse = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
    if let Some(err) = result.error {
        return Err(err);
    }
    Ok(result.text.unwrap_or_default())
}

// ========== Goals Commands ==========

#[tauri::command]
pub async fn get_goals() -> Result<serde_json::Value, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    let goals = api.get_goals().await?;
    serde_json::to_value(&goals).map_err(|e| format!("Serialize error: {}", e))
}

#[tauri::command]
pub async fn create_goal(name: String, description: Option<String>) -> Result<serde_json::Value, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    let goal = api.create_goal(&name, description.as_deref()).await?;
    serde_json::to_value(&goal).map_err(|e| format!("Serialize error: {}", e))
}

// ========== Tasks Commands ==========

#[tauri::command]
pub async fn get_tasks() -> Result<serde_json::Value, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    let tasks = api.get_tasks().await?;
    serde_json::to_value(&tasks).map_err(|e| format!("Serialize error: {}", e))
}

// ========== Knowledge Commands ==========

#[tauri::command]
pub async fn get_documents() -> Result<serde_json::Value, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    let docs = api.get_documents().await?;
    serde_json::to_value(&docs).map_err(|e| format!("Serialize error: {}", e))
}

#[tauri::command]
pub async fn upload_file(file_path: String) -> Result<(), String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));

    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Invalid file path")?;

    let data = std::fs::read(&file_path).map_err(|e| format!("Read file failed: {}", e))?;
    api.upload_file(&file_path, &file_name, data).await
}

#[tauri::command]
pub async fn search_knowledge(query: String) -> Result<serde_json::Value, String> {
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    let results = api.search_knowledge(&query).await?;
    serde_json::to_value(&results).map_err(|e| format!("Serialize error: {}", e))
}

// ========== Recall Commands ==========

#[tauri::command]
pub async fn start_recall() -> Result<(), String> {
    let db_path = get_db_path();
    let interval: u64 = get_setting(&db_path, "recall_interval_secs")
        .unwrap_or_else(|_| "30".to_string())
        .parse()
        .unwrap_or(30);

    // Get exclusions — scope the Connection so it's dropped before await
    let exclusions = {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT pattern FROM recall_exclusions")
            .map_err(|e| format!("Query error: {}", e))?;
        let exc: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("Query error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        exc
    };

    let mut engine = CaptureEngine::new(interval, db_path.clone());
    engine.start(exclusions).await?;

    set_setting(&db_path, "recall_enabled", "true")?;
    Ok(())
}

#[tauri::command]
pub async fn stop_recall() -> Result<(), String> {
    CaptureEngine::stop();
    let db_path = get_db_path();
    set_setting(&db_path, "recall_enabled", "false")?;
    Ok(())
}

#[tauri::command]
pub async fn search_recall(query: String, limit: Option<i64>) -> Result<Vec<RecallSearchResult>, String> {
    let db_path = get_db_path();
    indexer::search(&db_path, &query, limit.unwrap_or(50))
}

#[tauri::command]
pub async fn get_recall_timeline(
    date: Option<String>,
    app_filter: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<RecallEntry>, String> {
    let db_path = get_db_path();
    indexer::get_timeline(
        &db_path,
        date.as_deref(),
        app_filter.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub async fn get_recall_settings() -> Result<RecallSettings, String> {
    let db_path = get_db_path();
    let enabled = get_setting(&db_path, "recall_enabled").unwrap_or_else(|_| "false".to_string()) == "true";
    let interval_secs: u64 = get_setting(&db_path, "recall_interval_secs")
        .unwrap_or_else(|_| "30".to_string())
        .parse()
        .unwrap_or(30);
    let storage_mode = get_setting(&db_path, "recall_storage_mode").unwrap_or_else(|_| "local".to_string());

    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, pattern, type FROM recall_exclusions")
        .map_err(|e| format!("Query error: {}", e))?;
    let exclusions: Vec<RecallExclusion> = stmt
        .query_map([], |row| {
            Ok(RecallExclusion {
                id: row.get(0)?,
                pattern: row.get(1)?,
                exclusion_type: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(RecallSettings {
        enabled,
        interval_secs,
        storage_mode,
        exclusions,
    })
}

#[tauri::command]
pub async fn update_recall_settings(
    interval_secs: Option<u64>,
    storage_mode: Option<String>,
) -> Result<(), String> {
    let db_path = get_db_path();
    if let Some(interval) = interval_secs {
        set_setting(&db_path, "recall_interval_secs", &interval.to_string())?;
    }
    if let Some(mode) = storage_mode {
        set_setting(&db_path, "recall_storage_mode", &mode)?;
    }
    Ok(())
}

// ========== Assistant Commands ==========

#[tauri::command]
pub async fn start_dictation() -> Result<(), String> {
    let engine = DictationEngine::new();
    engine.start_recording()
}

#[tauri::command]
pub async fn stop_dictation() -> Result<String, String> {
    let engine = DictationEngine::new();
    let wav_data = engine.stop_recording()?;

    // Send to transcription API
    let db_path = get_db_path();
    let token = get_valid_token(&db_path).await?.ok_or("Not authenticated — please log in again")?;
    let api = ExoSkullApi::new(Some(token));
    api.transcribe_audio(wav_data).await
}

#[tauri::command]
pub async fn speak_text(text: String) -> Result<(), String> {
    let db_path = get_db_path();
    let provider = get_setting(&db_path, "tts_provider").unwrap_or_else(|_| "system".to_string());
    let token = get_valid_token(&db_path).await?.unwrap_or_default();

    let engine = TtsEngine::new(&provider);
    engine.speak(&text, Some(&token)).await
}

#[tauri::command]
pub async fn stop_speaking() -> Result<(), String> {
    let engine = TtsEngine::new("system");
    engine.stop();
    Ok(())
}

#[tauri::command]
pub async fn get_mouse_config() -> Result<MouseConfig, String> {
    let db_path = get_db_path();
    Ok(MouseConfig {
        button_dictation: get_setting(&db_path, "mouse_button_dictation")
            .unwrap_or_else(|_| "4".to_string())
            .parse()
            .unwrap_or(4),
        button_tts: get_setting(&db_path, "mouse_button_tts")
            .unwrap_or_else(|_| "5".to_string())
            .parse()
            .unwrap_or(5),
        button_chat: get_setting(&db_path, "mouse_button_chat")
            .unwrap_or_else(|_| "3".to_string())
            .parse()
            .unwrap_or(3),
    })
}

#[tauri::command]
pub async fn update_mouse_config(config: MouseConfig) -> Result<(), String> {
    let db_path = get_db_path();
    set_setting(&db_path, "mouse_button_dictation", &config.button_dictation.to_string())?;
    set_setting(&db_path, "mouse_button_tts", &config.button_tts.to_string())?;
    set_setting(&db_path, "mouse_button_chat", &config.button_chat.to_string())?;
    crate::assistant::mouse_hook::configure_buttons(
        config.button_dictation,
        config.button_tts,
        config.button_chat,
    );
    Ok(())
}

// ========== Uploader Commands ==========

#[tauri::command]
pub async fn add_watched_folder(path: String) -> Result<i64, String> {
    let db_path = get_db_path();
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "INSERT OR IGNORE INTO watched_folders (path) VALUES (?1)",
        params![path],
    )
    .map_err(|e| format!("Insert failed: {}", e))?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn remove_watched_folder(id: i64) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute("DELETE FROM watched_folders WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_watched_folders() -> Result<Vec<WatchedFolder>, String> {
    let db_path = get_db_path();
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, path, enabled, created_at FROM watched_folders")
        .map_err(|e| format!("Prepare failed: {}", e))?;
    let results: Vec<WatchedFolder> = stmt
        .query_map([], |row| {
            Ok(WatchedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn get_upload_queue() -> Result<Vec<UploadQueueItem>, String> {
    let db_path = get_db_path();
    crate::uploader::queue::get_all(&db_path, 50)
}

// ========== Settings Commands ==========

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let db_path = get_db_path();
    let recall = get_recall_settings().await?;
    let mouse = get_mouse_config().await?;

    Ok(AppSettings {
        auto_start: get_setting(&db_path, "auto_start").unwrap_or_else(|_| "false".to_string()) == "true",
        theme: get_setting(&db_path, "theme").unwrap_or_else(|_| "dark".to_string()),
        tts_provider: get_setting(&db_path, "tts_provider").unwrap_or_else(|_| "system".to_string()),
        recall,
        mouse,
    })
}

#[tauri::command]
pub async fn update_settings(
    auto_start: Option<bool>,
    theme: Option<String>,
    tts_provider: Option<String>,
) -> Result<(), String> {
    let db_path = get_db_path();
    if let Some(v) = auto_start {
        set_setting(&db_path, "auto_start", if v { "true" } else { "false" })?;
    }
    if let Some(v) = theme {
        set_setting(&db_path, "theme", &v)?;
    }
    if let Some(v) = tts_provider {
        set_setting(&db_path, "tts_provider", &v)?;
    }
    Ok(())
}
