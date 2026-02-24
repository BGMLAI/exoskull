use crate::api::ExoSkullApi;
use crate::recall::indexer;
use std::path::PathBuf;
use tokio::time::{interval, Duration};

pub struct RecallSync {
    db_path: PathBuf,
    api: ExoSkullApi,
}

impl RecallSync {
    pub fn new(db_path: PathBuf, token: String) -> Self {
        Self {
            db_path,
            api: ExoSkullApi::new(Some(token)),
        }
    }

    /// Sync unsynced recall entries to cloud.
    /// Called periodically or on demand.
    pub async fn sync_pending(&self) -> Result<u32, String> {
        let entries = indexer::get_unsynced(&self.db_path, 10)?;
        let mut synced_count = 0;

        for entry in entries {
            // Read image file
            let image_data = std::fs::read(&entry.image_path)
                .map_err(|e| format!("Read image failed: {}", e))?;

            let metadata = serde_json::json!({
                "timestamp": entry.timestamp,
                "app_name": entry.app_name,
                "window_title": entry.window_title,
                "ocr_text": entry.ocr_text,
            })
            .to_string();

            match self
                .api
                .upload_recall_screenshot(image_data, &entry.timestamp, &metadata)
                .await
            {
                Ok(()) => {
                    indexer::mark_synced(&self.db_path, entry.id)?;
                    synced_count += 1;
                    log::info!("Synced recall entry {}", entry.id);
                }
                Err(e) => {
                    log::error!("Failed to sync recall entry {}: {}", entry.id, e);
                    // Continue with next entry, don't fail the batch
                }
            }
        }

        Ok(synced_count)
    }

    /// Start background sync loop
    pub async fn start_sync_loop(self, interval_secs: u64) {
        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;
            match self.sync_pending().await {
                Ok(count) => {
                    if count > 0 {
                        log::info!("Synced {} recall entries", count);
                    }
                }
                Err(e) => {
                    log::error!("Recall sync failed: {}", e);
                }
            }
        }
    }
}
