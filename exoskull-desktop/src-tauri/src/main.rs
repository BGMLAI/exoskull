// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;

fn crash_log(msg: &str) {
    let path = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("C:\\"))
        .join(".exoskull");
    let _ = std::fs::create_dir_all(&path);
    let log_path = path.join("crash.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
    }
}

fn main() {
    crash_log("ExoSkull starting...");

    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {}", info);
        crash_log(&msg);
    }));

    match std::panic::catch_unwind(|| {
        exoskull_desktop_lib::run();
    }) {
        Ok(_) => {}
        Err(e) => {
            let msg = format!("FATAL: {:?}", e);
            crash_log(&msg);
        }
    }
}
