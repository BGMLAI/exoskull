package com.exoskull.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class ExoSkullApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val channels = listOf(
            NotificationChannel(
                "exoskull_default",
                "ExoSkull",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General notifications from ExoSkull"
            },
            NotificationChannel(
                "exoskull_proactive",
                "Proactive Insights",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Proactive messages and insights"
            },
            NotificationChannel(
                "exoskull_urgent",
                "Urgent",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent notifications requiring attention"
            },
        )

        val notificationManager = getSystemService(NotificationManager::class.java)
        channels.forEach { notificationManager.createNotificationChannel(it) }
    }
}
