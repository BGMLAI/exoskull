use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const BASE_URL: &str = "https://exoskull.xyz";
const SUPABASE_URL: &str = "https://uvupnwvkzreikurymncs.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dXBud3ZrenJlaWt1cnltbmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTYyODMsImV4cCI6MjA4NTUzMjI4M30.PXSMO4Dwq7s-Iywi1lYcPz0eyDpAHxIM47jLOP9y_Zo";

pub struct ExoSkullApi {
    client: Client,
    token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub tenant_id: String,
}

#[derive(Debug, Deserialize)]
struct SupabaseAuthResponse {
    access_token: String,
    refresh_token: Option<String>,
    user: SupabaseUser,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: String,
    email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub progress: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeSearchResult {
    pub id: String,
    pub title: String,
    pub content: String,
    pub score: f64,
}

impl ExoSkullApi {
    pub fn new(token: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        Self { client, token }
    }

    pub fn set_token(&mut self, token: String) {
        self.token = Some(token);
    }

    pub fn auth_header(&self) -> Option<String> {
        self.token.as_ref().map(|t| format!("Bearer {}", t))
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResponse, String> {
        let resp = self
            .client
            .post(format!("{}/auth/v1/token?grant_type=password", SUPABASE_URL))
            .header("apikey", SUPABASE_ANON_KEY)
            .header("Content-Type", "application/json")
            .json(&LoginRequest {
                email: email.to_string(),
                password: password.to_string(),
            })
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Login failed ({}): {}", status, body));
        }

        let auth: SupabaseAuthResponse = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(LoginResponse {
            token: auth.access_token,
            tenant_id: auth.user.id,
        })
    }

    pub async fn get_goals(&self) -> Result<Vec<Goal>, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;
        let resp = self
            .client
            .get(format!("{}/api/goals", BASE_URL))
            .header("Authorization", token)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Failed to fetch goals: {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("Parse error: {}", e))
    }

    pub async fn create_goal(&self, title: &str, description: Option<&str>) -> Result<Goal, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;

        #[derive(Serialize)]
        struct CreateGoalReq<'a> {
            title: &'a str,
            description: Option<&'a str>,
        }

        let resp = self
            .client
            .post(format!("{}/api/goals", BASE_URL))
            .header("Authorization", token)
            .json(&CreateGoalReq { title, description })
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Failed to create goal: {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("Parse error: {}", e))
    }

    pub async fn get_tasks(&self) -> Result<Vec<Task>, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;
        let resp = self
            .client
            .get(format!("{}/api/canvas/data/tasks", BASE_URL))
            .header("Authorization", token)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Failed to fetch tasks: {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("Parse error: {}", e))
    }

    pub async fn upload_file(&self, file_path: &str, file_name: &str, data: Vec<u8>) -> Result<(), String> {
        let token = self.auth_header().ok_or("Not authenticated")?;

        let part = reqwest::multipart::Part::bytes(data)
            .file_name(file_name.to_string())
            .mime_str("application/octet-stream")
            .map_err(|e| format!("Multipart error: {}", e))?;

        let form = reqwest::multipart::Form::new().part("file", part);

        let resp = self
            .client
            .post(format!("{}/api/knowledge/upload", BASE_URL))
            .header("Authorization", token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Upload error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Upload failed: {}", resp.status()));
        }

        Ok(())
    }

    pub async fn search_knowledge(&self, query: &str) -> Result<Vec<KnowledgeSearchResult>, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;
        let resp = self
            .client
            .get(format!("{}/api/knowledge/search", BASE_URL))
            .header("Authorization", token)
            .query(&[("q", query)])
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Search failed: {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("Parse error: {}", e))
    }

    pub async fn transcribe_audio(&self, audio_data: Vec<u8>) -> Result<String, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;

        let part = reqwest::multipart::Part::bytes(audio_data)
            .file_name("recording.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("Multipart error: {}", e))?;

        let form = reqwest::multipart::Form::new().part("audio", part);

        let resp = self
            .client
            .post(format!("{}/api/voice/transcribe", BASE_URL))
            .header("Authorization", token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Transcribe error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Transcription failed: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct TranscribeResponse {
            text: String,
        }

        let result: TranscribeResponse = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(result.text)
    }

    pub async fn text_to_speech(&self, text: &str) -> Result<Vec<u8>, String> {
        let token = self.auth_header().ok_or("Not authenticated")?;

        #[derive(Serialize)]
        struct TtsRequest<'a> {
            text: &'a str,
        }

        let resp = self
            .client
            .post(format!("{}/api/voice/tts", BASE_URL))
            .header("Authorization", token)
            .json(&TtsRequest { text })
            .send()
            .await
            .map_err(|e| format!("TTS error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("TTS failed: {}", resp.status()));
        }

        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("Read error: {}", e))
    }

    pub async fn upload_recall_screenshot(
        &self,
        data: Vec<u8>,
        timestamp: &str,
        metadata: &str,
    ) -> Result<(), String> {
        let token = self.auth_header().ok_or("Not authenticated")?;

        let part = reqwest::multipart::Part::bytes(data)
            .file_name(format!("recall_{}.png", timestamp))
            .mime_str("image/png")
            .map_err(|e| format!("Multipart error: {}", e))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("type", "recall")
            .text("metadata", metadata.to_string());

        let resp = self
            .client
            .post(format!("{}/api/knowledge/upload", BASE_URL))
            .header("Authorization", token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Upload error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Recall upload failed: {}", resp.status()));
        }

        Ok(())
    }
}
