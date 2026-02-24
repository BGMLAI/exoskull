use crate::api::ExoSkullApi;
use crate::uploader::queue;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::time::{interval, Duration};

pub struct UploadWorker {
    db_path: PathBuf,
    token: String,
}

impl UploadWorker {
    pub fn new(db_path: PathBuf, token: String) -> Self {
        Self { db_path, token }
    }

    /// Process pending uploads. Returns count of successful uploads.
    pub async fn process_pending(&self, app_handle: &AppHandle) -> Result<u32, String> {
        let pending = queue::get_pending(&self.db_path, 5)?;
        let api = ExoSkullApi::new(Some(self.token.clone()));
        let mut uploaded = 0;

        for item in pending {
            let data = match std::fs::read(&item.file_path) {
                Ok(d) => d,
                Err(e) => {
                    queue::mark_failed(&self.db_path, item.id, &format!("Read error: {}", e))?;
                    continue;
                }
            };

            match api.upload_file(&item.file_path, &item.file_name, data).await {
                Ok(()) => {
                    queue::mark_uploaded(&self.db_path, item.id)?;
                    uploaded += 1;
                    let _ = app_handle.emit(
                        "upload-complete",
                        serde_json::json!({
                            "id": item.id,
                            "file_name": item.file_name,
                        }),
                    );
                }
                Err(e) => {
                    queue::mark_failed(&self.db_path, item.id, &e)?;
                    let _ = app_handle.emit(
                        "upload-failed",
                        serde_json::json!({
                            "id": item.id,
                            "file_name": item.file_name,
                            "error": e,
                        }),
                    );
                }
            }
        }

        // Retry previously failed uploads (max 3 retries)
        queue::retry_failed(&self.db_path, 3)?;

        Ok(uploaded)
    }

    /// Start background upload loop
    pub async fn start_loop(self, app_handle: AppHandle, interval_secs: u64) {
        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;
            match self.process_pending(&app_handle).await {
                Ok(count) => {
                    if count > 0 {
                        log::info!("Uploaded {} files", count);
                    }
                }
                Err(e) => {
                    log::error!("Upload worker error: {}", e);
                }
            }
        }
    }
}
