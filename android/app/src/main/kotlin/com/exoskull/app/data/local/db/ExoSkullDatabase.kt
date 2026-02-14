package com.exoskull.app.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.exoskull.app.data.local.dao.*
import com.exoskull.app.data.local.entity.*

@Database(
    entities = [
        TaskEntity::class,
        MessageEntity::class,
        ConversationEntity::class,
        DocumentEntity::class,
        HealthMetricEntity::class,
        SyncQueueEntity::class,
        AiCacheEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class ExoSkullDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun messageDao(): MessageDao
    abstract fun conversationDao(): ConversationDao
    abstract fun healthMetricDao(): HealthMetricDao
    abstract fun syncQueueDao(): SyncQueueDao
}
