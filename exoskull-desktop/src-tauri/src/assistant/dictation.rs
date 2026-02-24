use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

static RECORDING: AtomicBool = AtomicBool::new(false);

// Global shared sample buffer
lazy_static::lazy_static! {
    static ref SAMPLES: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
}

pub struct DictationEngine {
    sample_rate: u32,
}

impl DictationEngine {
    pub fn new() -> Self {
        Self { sample_rate: 16000 }
    }

    /// Start recording audio from default input device.
    /// The stream is created and held entirely within a dedicated OS thread.
    pub fn start_recording(&self) -> Result<(), String> {
        if RECORDING.load(Ordering::SeqCst) {
            return Err("Already recording".to_string());
        }

        // Clear previous recording
        {
            let mut s = SAMPLES.lock().map_err(|e| format!("Lock error: {}", e))?;
            s.clear();
        }

        RECORDING.store(true, Ordering::SeqCst);

        let sample_rate = self.sample_rate;
        let samples = SAMPLES.clone();

        // Create stream on a dedicated thread (cpal::Stream is !Send)
        std::thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    log::error!("No input device found");
                    RECORDING.store(false, Ordering::SeqCst);
                    return;
                }
            };

            let config = cpal::StreamConfig {
                channels: 1,
                sample_rate: cpal::SampleRate(sample_rate),
                buffer_size: cpal::BufferSize::Default,
            };

            let samples_clone = samples.clone();
            let stream = match device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if RECORDING.load(Ordering::SeqCst) {
                        if let Ok(mut s) = samples_clone.lock() {
                            s.extend_from_slice(data);
                        }
                    }
                },
                move |err| {
                    log::error!("Audio input error: {}", err);
                },
                None,
            ) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Stream build failed: {}", e);
                    RECORDING.store(false, Ordering::SeqCst);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                log::error!("Stream play failed: {}", e);
                RECORDING.store(false, Ordering::SeqCst);
                return;
            }

            // Keep thread alive while recording — stream lives on this thread
            while RECORDING.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            drop(stream);
        });

        Ok(())
    }

    /// Stop recording and return WAV data
    pub fn stop_recording(&self) -> Result<Vec<u8>, String> {
        RECORDING.store(false, Ordering::SeqCst);

        // Wait for recording thread to flush and drop stream
        std::thread::sleep(std::time::Duration::from_millis(200));

        let samples = SAMPLES
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if samples.is_empty() {
            return Err("No audio recorded".to_string());
        }

        // Encode as WAV
        let spec = WavSpec {
            channels: 1,
            sample_rate: self.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer =
                WavWriter::new(&mut cursor, spec).map_err(|e| format!("WAV write error: {}", e))?;

            for &sample in samples.iter() {
                let int_sample = (sample * 32767.0) as i16;
                writer
                    .write_sample(int_sample)
                    .map_err(|e| format!("Sample write error: {}", e))?;
            }

            writer
                .finalize()
                .map_err(|e| format!("WAV finalize error: {}", e))?;
        }

        Ok(cursor.into_inner())
    }

    pub fn is_recording() -> bool {
        RECORDING.load(Ordering::SeqCst)
    }
}
