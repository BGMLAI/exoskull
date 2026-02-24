use chrono::Utc;
use image::DynamicImage;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::time::{interval, Duration};
use xcap::Monitor;

use super::indexer;
use super::ocr;
use crate::db;

static CAPTURE_RUNNING: AtomicBool = AtomicBool::new(false);

pub struct CaptureEngine {
    interval_secs: u64,
    storage_dir: PathBuf,
    db_path: PathBuf,
    running: Arc<AtomicBool>,
    last_hash: Option<String>,
}

impl CaptureEngine {
    pub fn new(interval_secs: u64, db_path: PathBuf) -> Self {
        let storage_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".exoskull")
            .join("recall");

        Self {
            interval_secs,
            storage_dir,
            db_path,
            running: Arc::new(AtomicBool::new(false)),
            last_hash: None,
        }
    }

    pub fn is_running() -> bool {
        CAPTURE_RUNNING.load(Ordering::SeqCst)
    }

    pub async fn start(&mut self, exclusions: Vec<String>) -> Result<(), String> {
        if CAPTURE_RUNNING.load(Ordering::SeqCst) {
            return Err("Capture already running".to_string());
        }

        CAPTURE_RUNNING.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);

        let interval_secs = self.interval_secs;
        let storage_dir = self.storage_dir.clone();
        let db_path = self.db_path.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(interval_secs));
            let mut last_hash: Option<String> = None;

            loop {
                ticker.tick().await;

                if !CAPTURE_RUNNING.load(Ordering::SeqCst) {
                    break;
                }

                match capture_screen(&storage_dir, &db_path, &exclusions, &mut last_hash) {
                    Ok(Some(path)) => {
                        log::info!("Captured screenshot: {:?}", path);
                    }
                    Ok(None) => {
                        log::debug!("Screenshot skipped (unchanged or excluded)");
                    }
                    Err(e) => {
                        log::error!("Screenshot capture failed: {}", e);
                    }
                }
            }
        });

        Ok(())
    }

    pub fn stop() {
        CAPTURE_RUNNING.store(false, Ordering::SeqCst);
    }
}

fn capture_screen(
    storage_dir: &PathBuf,
    db_path: &PathBuf,
    exclusions: &[String],
    last_hash: &mut Option<String>,
) -> Result<Option<String>, String> {
    // Get primary monitor
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;
    let monitor = monitors.first().ok_or("No monitors found")?;

    // Capture screenshot
    let image = monitor
        .capture_image()
        .map_err(|e| format!("Capture failed: {}", e))?;

    // Compute hash to detect unchanged screens
    let raw_bytes = image.as_raw();
    let mut hasher = Sha256::new();
    // Sample every 1000th byte for fast comparison
    for (i, byte) in raw_bytes.iter().enumerate() {
        if i % 1000 == 0 {
            hasher.update([*byte]);
        }
    }
    let hash = format!("{:x}", hasher.finalize());

    if last_hash.as_ref() == Some(&hash) {
        return Ok(None); // Screen unchanged
    }
    *last_hash = Some(hash.clone());

    // Get window info (platform-specific)
    let (app_name, window_title) = get_active_window_info();

    // Check exclusions
    for pattern in exclusions {
        let pattern_lower = pattern.to_lowercase();
        if let Some(ref app) = app_name {
            if app.to_lowercase().contains(&pattern_lower) {
                return Ok(None);
            }
        }
        if let Some(ref title) = window_title {
            if title.to_lowercase().contains(&pattern_lower) {
                return Ok(None);
            }
        }
    }

    // Create storage path
    let now = Utc::now();
    let date_dir = storage_dir
        .join(now.format("%Y").to_string())
        .join(now.format("%m").to_string())
        .join(now.format("%d").to_string());
    std::fs::create_dir_all(&date_dir).map_err(|e| format!("Dir create failed: {}", e))?;

    let filename = format!("{}.png", now.format("%H-%M-%S"));
    let image_path = date_dir.join(&filename);
    let image_path_str = image_path.to_string_lossy().to_string();

    // Save full image
    let dynamic_image = DynamicImage::ImageRgba8(image);
    dynamic_image
        .save(&image_path)
        .map_err(|e| format!("Save failed: {}", e))?;

    // Generate thumbnail
    let thumbnail = dynamic_image.thumbnail(320, 180);
    let thumb_path = date_dir.join(format!("thumb_{}", &filename));
    let thumb_path_str = thumb_path.to_string_lossy().to_string();
    thumbnail
        .save(&thumb_path)
        .map_err(|e| format!("Thumbnail save failed: {}", e))?;

    // Run OCR (stub for now)
    let ocr_text = ocr::extract_text(&image_path_str).unwrap_or_default();

    // Index in SQLite
    let timestamp = now.to_rfc3339();
    indexer::insert_entry(
        db_path,
        &timestamp,
        app_name.as_deref(),
        window_title.as_deref(),
        if ocr_text.is_empty() {
            None
        } else {
            Some(&ocr_text)
        },
        &image_path_str,
        Some(&thumb_path_str),
        &hash,
    )?;

    Ok(Some(image_path_str))
}

fn get_active_window_info() -> (Option<String>, Option<String>) {
    // Platform-specific active window detection
    // For now, return None — this will be enhanced with x11/wayland/win32 APIs
    #[cfg(target_os = "linux")]
    {
        // Try xdotool for X11
        if let Ok(output) = std::process::Command::new("xdotool")
            .args(["getactivewindow", "getwindowname"])
            .output()
        {
            if output.status.success() {
                let title = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Try to get the WM_CLASS for app name
                if let Ok(id_output) = std::process::Command::new("xdotool")
                    .args(["getactivewindow"])
                    .output()
                {
                    let window_id = String::from_utf8_lossy(&id_output.stdout).trim().to_string();
                    if let Ok(class_output) = std::process::Command::new("xprop")
                        .args(["-id", &window_id, "WM_CLASS"])
                        .output()
                    {
                        let class_str = String::from_utf8_lossy(&class_output.stdout);
                        let app_name = class_str
                            .split('"')
                            .nth(3)
                            .map(|s| s.to_string());
                        return (app_name, Some(title));
                    }
                }
                return (None, Some(title));
            }
        }
        (None, None)
    }
    #[cfg(not(target_os = "linux"))]
    {
        (None, None)
    }
}
