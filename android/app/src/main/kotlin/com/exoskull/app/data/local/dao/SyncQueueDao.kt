package com.exoskull.app.data.local.dao

import androidx.room.*
import com.exoskull.app.data.local.entity.SyncQueueEntity

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue WHERE retry_count < 3 ORDER BY created_at ASC LIMIT :limit")
    suspend fun getPending(limit: Int = 50): List<SyncQueueEntity>

    @Insert
    suspend fun insert(item: SyncQueueEntity)

    @Update
    suspend fun update(item: SyncQueueEntity)

    @Delete
    suspend fun delete(item: SyncQueueEntity)

    @Query("DELETE FROM sync_queue WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("SELECT COUNT(*) FROM sync_queue")
    suspend fun count(): Int
}
