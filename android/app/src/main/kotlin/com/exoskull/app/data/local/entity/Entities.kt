package com.exoskull.app.data.local.entity

import androidx.room.*

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val description: String? = null,
    val status: String = "pending", // pending, active, completed, dropped, blocked
    val priority: Int = 5, // 1-10
    @ColumnInfo(name = "due_date") val dueDate: String? = null,
    @ColumnInfo(name = "quest_id") val questId: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    @ColumnInfo(name = "synced_at") val syncedAt: String? = null,
    @ColumnInfo(name = "is_local") val isLocal: Boolean = false,
)

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String? = null,
    val role: String, // user, assistant
    val content: String,
    val channel: String = "android_app",
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "synced_at") val syncedAt: String? = null,
)

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val channel: String = "android_app",
    @ColumnInfo(name = "started_at") val startedAt: String,
    @ColumnInfo(name = "last_message_at") val lastMessageAt: String? = null,
    @ColumnInfo(name = "synced_at") val syncedAt: String? = null,
)

@Entity(tableName = "documents")
data class DocumentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "file_name") val fileName: String,
    @ColumnInfo(name = "file_type") val fileType: String? = null,
    val status: String = "pending",
    @ColumnInfo(name = "extracted_text_preview") val extractedTextPreview: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    @ColumnInfo(name = "synced_at") val syncedAt: String? = null,
)

@Entity(tableName = "health_metrics")
data class HealthMetricEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "metric_type") val metricType: String, // steps, sleep, hr, weight, etc.
    val value: Double,
    val unit: String? = null,
    @ColumnInfo(name = "recorded_at") val recordedAt: String,
    @ColumnInfo(name = "synced_at") val syncedAt: String? = null,
    @ColumnInfo(name = "is_local") val isLocal: Boolean = true,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "table_name") val tableName: String,
    val operation: String, // INSERT, UPDATE, DELETE
    @ColumnInfo(name = "record_id") val recordId: String,
    @ColumnInfo(name = "payload_json") val payloadJson: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "retry_count") val retryCount: Int = 0,
    @ColumnInfo(name = "last_error") val lastError: String? = null,
)

@Entity(tableName = "ai_cache")
data class AiCacheEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "prompt_hash") val promptHash: String,
    val response: String,
    val model: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "ttl_seconds") val ttlSeconds: Int = 3600,
)
