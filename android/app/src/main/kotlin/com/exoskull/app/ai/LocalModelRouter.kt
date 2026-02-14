package com.exoskull.app.ai

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local Model Router — decides whether to use on-device AI or cloud.
 *
 * Routing logic:
 * - Simple action (alarm, reminder, toggle) → FunctionGemma 270M (local)
 * - Simple Q&A → Gemma 3n E4B (local, ~3s)
 * - Complex reasoning → Cloud API (Qwen3/Sonnet/Opus)
 * - Crisis keywords → Cloud (Opus) IMMEDIATE
 * - Offline + complex → Queue for later + best-effort local
 */
@Singleton
class LocalModelRouter @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    enum class Route {
        LOCAL_FUNCTION,   // FunctionGemma — intent → action
        LOCAL_CHAT,       // Gemma 3n — conversation
        CLOUD,            // Server API
        CLOUD_CRISIS,     // Server API — Opus tier, immediate
    }

    private val crisisKeywords = setOf(
        "samobójcz", "suicide", "kryzys", "crisis", "przemoc",
        "violence", "panic", "panika", "emergency", "nagły",
        "help me", "pomóż",
    )

    private val actionKeywords = setOf(
        "ustaw alarm", "set alarm", "przypomnij", "remind",
        "dodaj do listy", "add to list", "włącz", "wyłącz",
        "toggle", "turn on", "turn off",
    )

    fun route(input: String, isOnline: Boolean): Route {
        val lower = input.lowercase()

        // 1. Crisis — always cloud (Opus)
        if (crisisKeywords.any { lower.contains(it) }) {
            return if (isOnline) Route.CLOUD_CRISIS else Route.LOCAL_CHAT
        }

        // 2. Simple actions — FunctionGemma
        if (actionKeywords.any { lower.contains(it) }) {
            return Route.LOCAL_FUNCTION
        }

        // 3. Short, simple messages — local chat
        if (input.length < 200 && !isComplexQuery(lower)) {
            return Route.LOCAL_CHAT
        }

        // 4. Complex or long — cloud if online, local fallback if offline
        return if (isOnline) Route.CLOUD else Route.LOCAL_CHAT
    }

    private fun isComplexQuery(text: String): Boolean {
        val complexIndicators = setOf(
            "analiz", "analyze", "porównaj", "compare",
            "wyjaśnij szczegółowo", "explain in detail",
            "napisz dokument", "write document", "strategia", "strategy",
            "kod", "code", "implement", "zbuduj", "build",
        )
        return complexIndicators.any { text.contains(it) }
    }
}
