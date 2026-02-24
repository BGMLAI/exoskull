mod api;
mod assistant;
mod commands;
mod db;
mod recall;
mod uploader;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

fn init_logging() {
    // Log to file on Windows (console hidden in release)
    let log_path = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".exoskull")
        .join("exoskull.log");
    let _ = std::fs::create_dir_all(log_path.parent().unwrap());

    if let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        env_logger::Builder::from_default_env()
            .target(env_logger::Target::Pipe(Box::new(file)))
            .filter_level(log::LevelFilter::Info)
            .init();
    } else {
        env_logger::init();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            let db_path = db::get_db_path(&app_handle);
            db::initialize(&db_path)?;

            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show ExoSkull", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("ExoSkull Desktop")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Show main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            log::info!("ExoSkull Desktop initialized");
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::login,
            commands::logout,
            commands::get_auth_status,
            // Chat
            commands::send_chat_message,
            // Goals
            commands::get_goals,
            commands::create_goal,
            // Tasks
            commands::get_tasks,
            // Knowledge
            commands::get_documents,
            commands::upload_file,
            commands::search_knowledge,
            // Recall
            commands::start_recall,
            commands::stop_recall,
            commands::search_recall,
            commands::get_recall_timeline,
            commands::get_recall_settings,
            commands::update_recall_settings,
            // Assistant
            commands::start_dictation,
            commands::stop_dictation,
            commands::speak_text,
            commands::stop_speaking,
            commands::get_mouse_config,
            commands::update_mouse_config,
            // Uploader
            commands::add_watched_folder,
            commands::remove_watched_folder,
            commands::get_watched_folders,
            commands::get_upload_queue,
            // Settings
            commands::get_settings,
            commands::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ExoSkull Desktop");
}
