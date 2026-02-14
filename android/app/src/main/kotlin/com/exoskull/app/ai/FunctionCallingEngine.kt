package com.exoskull.app.ai

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * FunctionGemma 270M — Lightweight function-calling model
 *
 * Maps user intents to Android system actions:
 * - set_alarm(time) → AlarmManager
 * - set_reminder(text, time) → NotificationManager
 * - add_to_list(list, item) → Room DB
 * - toggle_setting(setting) → Android Settings
 * - read_health(metric) → HealthConnect
 *
 * TODO (Phase 3): Integrate actual FunctionGemma model
 */
@Singleton
class FunctionCallingEngine @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    data class FunctionCall(
        val name: String,
        val arguments: Map<String, String>,
    )

    /**
     * Parse user input and extract function call intent
     */
    fun parseIntent(input: String): FunctionCall? {
        val lower = input.lowercase()

        // Simple rule-based parsing (will be replaced by FunctionGemma in Phase 3)
        return when {
            lower.contains("alarm") || lower.contains("budzik") -> {
                FunctionCall("set_alarm", mapOf("input" to input))
            }
            lower.contains("przypomnij") || lower.contains("remind") -> {
                FunctionCall("set_reminder", mapOf("text" to input))
            }
            lower.contains("dodaj do") || lower.contains("add to") -> {
                FunctionCall("add_to_list", mapOf("input" to input))
            }
            else -> null
        }
    }

    /**
     * Execute a parsed function call
     */
    suspend fun execute(call: FunctionCall): String {
        return when (call.name) {
            "set_alarm" -> {
                // TODO: Use AlarmManager
                "Alarm set (feature coming soon)"
            }
            "set_reminder" -> {
                // TODO: Use NotificationManager with scheduled trigger
                "Reminder set (feature coming soon)"
            }
            "add_to_list" -> {
                // TODO: Add to Room DB list
                "Item added (feature coming soon)"
            }
            else -> "Unknown function: ${call.name}"
        }
    }
}
