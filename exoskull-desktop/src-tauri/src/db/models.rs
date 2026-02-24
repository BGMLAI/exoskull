use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecallEntry {
    pub id: i64,
    pub timestamp: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub ocr_text: Option<String>,
    pub image_path: String,
    pub thumbnail_path: Option<String>,
    pub synced: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecallSearchResult {
    pub id: i64,
    pub timestamp: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub ocr_text: Option<String>,
    pub image_path: String,
    pub thumbnail_path: Option<String>,
    pub rank: f64,
    pub snippet: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadQueueItem {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub status: String,
    pub retries: i32,
    pub error: Option<String>,
    pub created_at: String,
    pub uploaded_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchedFolder {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecallSettings {
    pub enabled: bool,
    pub interval_secs: u64,
    pub storage_mode: String, // "local", "cloud", "local+cloud"
    pub exclusions: Vec<RecallExclusion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecallExclusion {
    pub id: i64,
    pub pattern: String,
    pub exclusion_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MouseConfig {
    pub button_dictation: u8,
    pub button_tts: u8,
    pub button_chat: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub auto_start: bool,
    pub theme: String,
    pub tts_provider: String,
    pub recall: RecallSettings,
    pub mouse: MouseConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthState {
    pub token: Option<String>,
    pub tenant_id: Option<String>,
    pub user_email: Option<String>,
    pub is_authenticated: bool,
}
