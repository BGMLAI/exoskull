package com.exoskull.app.data.local.dao

import androidx.room.*
import com.exoskull.app.data.local.entity.HealthMetricEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HealthMetricDao {
    @Query("SELECT * FROM health_metrics WHERE metric_type = :type ORDER BY recorded_at DESC LIMIT :limit")
    fun getByType(type: String, limit: Int = 30): Flow<List<HealthMetricEntity>>

    @Query("SELECT * FROM health_metrics WHERE recorded_at >= :since ORDER BY recorded_at DESC")
    fun getRecent(since: String): Flow<List<HealthMetricEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(metric: HealthMetricEntity)

    @Upsert
    suspend fun upsertAll(metrics: List<HealthMetricEntity>)

    @Query("SELECT * FROM health_metrics WHERE is_local = 1")
    suspend fun getUnsynced(): List<HealthMetricEntity>

    @Query("SELECT MAX(synced_at) FROM health_metrics")
    suspend fun getLastSyncedAt(): String?
}
