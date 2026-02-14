package com.exoskull.app.ai

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gemma 3n E4B On-Device Engine
 *
 * Handles local chat/reasoning using Gemma 3n via LiteRT-LM or MediaPipe.
 * Model download: ~3GB, WiFi only, with progress indicator.
 *
 * TODO (Phase 3): Integrate actual MediaPipe LLM Inference SDK
 * - Download model on first launch
 * - Session management
 * - Streaming token generation
 * - 128K context window
 */
@Singleton
class GemmaEngine @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var isReady = false

    /**
     * Check if the model is downloaded and ready
     */
    fun isModelReady(): Boolean = isReady

    /**
     * Download model (WiFi only, shows progress)
     */
    suspend fun downloadModel(onProgress: (Float) -> Unit) {
        // TODO: Implement actual model download
        // - Check if model file exists in app's files dir
        // - Download from GCS/HF if not present
        // - Track progress for UI
        onProgress(1f)
        isReady = true
    }

    /**
     * Generate response from prompt
     */
    fun generate(
        prompt: String,
        systemPrompt: String? = null,
        maxTokens: Int = 1024,
    ): Flow<String> = flow {
        // TODO (Phase 3): Replace with actual MediaPipe LLM inference
        // For now, emit a placeholder indicating local AI is not yet configured
        emit("On-device AI is being set up. Your message will be processed when the model is ready.")
    }

    /**
     * Clear session context
     */
    fun clearSession() {
        // TODO: Clear LLM session state
    }
}
