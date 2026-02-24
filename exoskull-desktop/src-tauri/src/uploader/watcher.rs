use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

use super::queue;

pub struct FolderWatcher {
    _watcher: RecommendedWatcher,
}

impl FolderWatcher {
    pub fn new(
        folders: Vec<String>,
        db_path: PathBuf,
        app_handle: AppHandle,
    ) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("Watcher create failed: {}", e))?;

        for folder in &folders {
            let path = PathBuf::from(folder);
            if path.exists() {
                watcher
                    .watch(&path, RecursiveMode::Recursive)
                    .map_err(|e| format!("Watch {} failed: {}", folder, e))?;
                log::info!("Watching folder: {}", folder);
            } else {
                log::warn!("Folder does not exist, skipping: {}", folder);
            }
        }

        // Process events in background thread
        let db = db_path.clone();
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            for event in rx {
                match event {
                    Ok(event) => {
                        if matches!(
                            event.kind,
                            notify::EventKind::Create(_) | notify::EventKind::Modify(_)
                        ) {
                            for path in event.paths {
                                if path.is_file() {
                                    let file_name = path
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_default();
                                    let file_path = path.to_string_lossy().to_string();

                                    match queue::enqueue(&db, &file_path, &file_name) {
                                        Ok(id) => {
                                            log::info!("Queued for upload: {} (id: {})", file_name, id);
                                            let _ = handle.emit(
                                                "upload-queued",
                                                serde_json::json!({
                                                    "id": id,
                                                    "file_name": file_name,
                                                    "file_path": file_path,
                                                }),
                                            );
                                        }
                                        Err(e) => {
                                            log::error!("Queue failed for {}: {}", file_name, e);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Watch error: {}", e);
                    }
                }
            }
        });

        Ok(FolderWatcher {
            _watcher: watcher,
        })
    }
}
