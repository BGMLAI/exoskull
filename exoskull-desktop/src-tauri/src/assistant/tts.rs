use crate::api::ExoSkullApi;
use std::sync::atomic::{AtomicBool, Ordering};

static SPEAKING: AtomicBool = AtomicBool::new(false);

pub struct TtsEngine {
    provider: String, // "system" or "elevenlabs"
}

impl TtsEngine {
    pub fn new(provider: &str) -> Self {
        Self {
            provider: provider.to_string(),
        }
    }

    /// Speak text using configured provider.
    /// For "system", uses OS TTS. For "elevenlabs", calls ExoSkull API.
    pub async fn speak(&self, text: &str, token: Option<&str>) -> Result<(), String> {
        if SPEAKING.load(Ordering::SeqCst) {
            self.stop();
        }

        SPEAKING.store(true, Ordering::SeqCst);

        match self.provider.as_str() {
            "elevenlabs" => {
                let api = ExoSkullApi::new(token.map(|t| t.to_string()));
                let audio_data = api.text_to_speech(text).await?;

                // Write to temp file and play
                let temp_path = std::env::temp_dir().join("exoskull_tts.wav");
                std::fs::write(&temp_path, &audio_data)
                    .map_err(|e| format!("Write audio failed: {}", e))?;

                play_audio_file(&temp_path.to_string_lossy())?;
            }
            _ => {
                // System TTS fallback — use platform commands
                system_tts(text)?;
            }
        }

        SPEAKING.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub fn stop(&self) {
        SPEAKING.store(false, Ordering::SeqCst);
        // Kill any running TTS process
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("pkill")
                .args(["-f", "espeak"])
                .output();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("pkill")
                .args(["-f", "say"])
                .output();
        }
    }

    pub fn is_speaking() -> bool {
        SPEAKING.load(Ordering::SeqCst)
    }
}

fn system_tts(text: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("espeak")
            .arg(text)
            .spawn()
            .map_err(|e| format!("espeak failed: {} — install with: apt install espeak", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("say")
            .arg(text)
            .spawn()
            .map_err(|e| format!("say failed: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        // Use PowerShell for TTS
        let script = format!(
            "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('{}')",
            text.replace('\'', "''")
        );
        std::process::Command::new("powershell")
            .args(["-Command", &script])
            .spawn()
            .map_err(|e| format!("PowerShell TTS failed: {}", e))?;
    }
    Ok(())
}

fn play_audio_file(path: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("aplay")
            .arg(path)
            .spawn()
            .map_err(|e| format!("aplay failed: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("afplay")
            .arg(path)
            .spawn()
            .map_err(|e| format!("afplay failed: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "(New-Object Media.SoundPlayer '{}').PlaySync()",
            path.replace('\'', "''")
        );
        std::process::Command::new("powershell")
            .args(["-Command", &script])
            .spawn()
            .map_err(|e| format!("PowerShell audio failed: {}", e))?;
    }
    Ok(())
}
