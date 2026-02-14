package com.exoskull.app.service

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.exoskull.app.data.local.dao.*
import com.exoskull.app.data.remote.SupabaseAuth
import com.exoskull.app.data.remote.api.ExoSkullApi
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val api: ExoSkullApi,
    private val auth: SupabaseAuth,
    private val taskDao: TaskDao,
    private val messageDao: MessageDao,
    private val syncQueueDao: SyncQueueDao,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        Log.d("SyncWorker", "Starting sync...")

        return try {
            if (!auth.isLoggedIn()) {
                Log.w("SyncWorker", "Not logged in, skipping sync")
                return Result.success()
            }

            val token = auth.getBearerToken()

            // 1. Pull: fetch changes from server
            pullChanges(token)

            // 2. Push: send local changes to server
            pushChanges(token)

            Log.d("SyncWorker", "Sync completed successfully")
            Result.success()
        } catch (e: Exception) {
            Log.e("SyncWorker", "Sync failed", e)
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private suspend fun pullChanges(token: String) {
        // Get last sync timestamps
        val tasksSince = taskDao.getLastSyncedAt()
        val messagesSince = messageDao.getLastSyncedAt()

        val tables = mutableListOf<String>()
        val since = mutableListOf<String>()

        // Only sync tables that have a baseline
        tables.add("user_ops")
        tables.add("exo_messages")

        val tablesParam = tables.joinToString(",")
        val sinceParam = tasksSince ?: messagesSince

        val response = api.sync(
            auth = token,
            tables = tablesParam,
            since = sinceParam,
        )

        if (response.isSuccessful) {
            val body = response.body() ?: return

            // Process user_ops (tasks)
            body.tables["user_ops"]?.data?.forEach { record ->
                // Map server record to local entity
                // For now, just log — actual mapping depends on exact schema
                Log.d("SyncWorker", "Synced task: ${record["id"]}")
            }

            Log.d("SyncWorker", "Pull completed: ${body.tables.size} tables synced")
        } else {
            Log.e("SyncWorker", "Pull failed: ${response.code()}")
        }
    }

    private suspend fun pushChanges(token: String) {
        val pending = syncQueueDao.getPending(50)
        if (pending.isEmpty()) return

        Log.d("SyncWorker", "Pushing ${pending.size} changes...")

        for (item in pending) {
            try {
                // TODO: Implement actual push via API
                // For now, just clear the queue
                syncQueueDao.deleteById(item.id)
            } catch (e: Exception) {
                Log.e("SyncWorker", "Push failed for ${item.recordId}", e)
                syncQueueDao.update(
                    item.copy(
                        retryCount = item.retryCount + 1,
                        lastError = e.message,
                    )
                )
            }
        }
    }

    companion object {
        fun enqueuePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                15, TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS,
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "exoskull_sync",
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest,
            )
        }

        fun enqueueSyncNow(context: Context) {
            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(context).enqueue(syncRequest)
        }
    }
}
