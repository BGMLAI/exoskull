package com.exoskull.app.data.remote.dto

import com.google.gson.annotations.SerializedName

// ── Sync DTOs ──

data class SyncResponse(
    @SerializedName("syncedAt") val syncedAt: String,
    @SerializedName("tables") val tables: Map<String, SyncTableResult>,
)

data class SyncTableResult(
    @SerializedName("data") val data: List<Map<String, Any?>>,
    @SerializedName("count") val count: Int,
    @SerializedName("hasMore") val hasMore: Boolean,
    @SerializedName("nextCursor") val nextCursor: String?,
)

// ── Push DTOs ──

data class PushTokenRequest(
    @SerializedName("token") val token: String,
    @SerializedName("deviceName") val deviceName: String?,
    @SerializedName("platform") val platform: String = "android",
)

data class PushTokenDeleteRequest(
    @SerializedName("token") val token: String,
)

// ── Chat DTOs ──

data class SendMessageRequest(
    @SerializedName("text") val text: String,
    @SerializedName("channel") val channel: String = "android_app",
)

data class SendMessageResponse(
    @SerializedName("text") val text: String,
    @SerializedName("toolsUsed") val toolsUsed: List<String>?,
)

// ── Common ──

data class SuccessResponse(
    @SerializedName("success") val success: Boolean,
)
