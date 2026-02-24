pub mod capture;
pub mod indexer;
pub mod sync;

// OCR module - placeholder until ocrs is integrated
pub mod ocr {
    /// Extract text from a screenshot image file.
    /// Currently a stub — returns empty string.
    /// Will be replaced with `ocrs` crate integration or cloud OCR fallback.
    pub fn extract_text(_image_path: &str) -> Result<String, String> {
        // TODO: Integrate ocrs crate for local OCR
        // For MVP, we index by window title and app name only
        Ok(String::new())
    }
}
