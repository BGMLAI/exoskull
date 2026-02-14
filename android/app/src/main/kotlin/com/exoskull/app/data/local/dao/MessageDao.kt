package com.exoskull.app.data.local.dao

import androidx.room.*
import com.exoskull.app.data.local.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages ORDER BY created_at DESC LIMIT :limit")
    fun getRecentMessages(limit: Int = 100): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE conversation_id = :conversationId ORDER BY created_at ASC")
    fun getMessagesForConversation(conversationId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)

    @Upsert
    suspend fun upsertAll(messages: List<MessageEntity>)

    @Query("SELECT MAX(synced_at) FROM messages")
    suspend fun getLastSyncedAt(): String?

    @Query("DELETE FROM messages")
    suspend fun deleteAll()
}
