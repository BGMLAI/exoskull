use rdev::{listen, Event, EventType, Button};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);

// Configurable button codes
static DICTATION_BUTTON: AtomicU8 = AtomicU8::new(4);
static TTS_BUTTON: AtomicU8 = AtomicU8::new(5);
static CHAT_BUTTON: AtomicU8 = AtomicU8::new(3);

#[derive(Debug, Clone, serde::Serialize)]
pub struct MouseEvent {
    pub action: String, // "dictation_start", "dictation_stop", "tts", "chat"
    pub button: u8,
}

pub fn configure_buttons(dictation: u8, tts: u8, chat: u8) {
    DICTATION_BUTTON.store(dictation, Ordering::SeqCst);
    TTS_BUTTON.store(tts, Ordering::SeqCst);
    CHAT_BUTTON.store(chat, Ordering::SeqCst);
}

pub fn start_mouse_hook(app_handle: AppHandle) -> Result<(), String> {
    if HOOK_RUNNING.load(Ordering::SeqCst) {
        return Err("Mouse hook already running".to_string());
    }

    HOOK_RUNNING.store(true, Ordering::SeqCst);
    let dictation_active = Arc::new(AtomicBool::new(false));
    let dictation_active_clone = dictation_active.clone();

    std::thread::spawn(move || {
        let handle = app_handle;
        let dict_active = dictation_active_clone;

        let callback = move |event: Event| {
            let dictation_btn = DICTATION_BUTTON.load(Ordering::SeqCst);
            let tts_btn = TTS_BUTTON.load(Ordering::SeqCst);
            let chat_btn = CHAT_BUTTON.load(Ordering::SeqCst);

            match event.event_type {
                EventType::ButtonPress(button) => {
                    let button_code = button_to_code(&button);

                    if button_code == dictation_btn {
                        dict_active.store(true, Ordering::SeqCst);
                        let _ = handle.emit("mouse-event", MouseEvent {
                            action: "dictation_start".to_string(),
                            button: button_code,
                        });
                    } else if button_code == tts_btn {
                        let _ = handle.emit("mouse-event", MouseEvent {
                            action: "tts".to_string(),
                            button: button_code,
                        });
                    } else if button_code == chat_btn {
                        let _ = handle.emit("mouse-event", MouseEvent {
                            action: "chat".to_string(),
                            button: button_code,
                        });
                    }
                }
                EventType::ButtonRelease(button) => {
                    let button_code = button_to_code(&button);

                    if button_code == dictation_btn && dict_active.load(Ordering::SeqCst) {
                        dict_active.store(false, Ordering::SeqCst);
                        let _ = handle.emit("mouse-event", MouseEvent {
                            action: "dictation_stop".to_string(),
                            button: button_code,
                        });
                    }
                }
                _ => {}
            }
        };

        if let Err(e) = listen(callback) {
            log::error!("Mouse hook error: {:?}", e);
            HOOK_RUNNING.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}

fn button_to_code(button: &Button) -> u8 {
    match button {
        Button::Left => 1,
        Button::Right => 2,
        Button::Middle => 3,
        Button::Unknown(code) => *code,
    }
}

pub fn stop_mouse_hook() {
    HOOK_RUNNING.store(false, Ordering::SeqCst);
    // Note: rdev::listen blocks the thread, so actual stop requires process-level control.
    // For now, the flag prevents new event emission.
}
