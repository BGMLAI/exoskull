package com.exoskull.app.di

import android.content.Context
import androidx.room.Room
import com.exoskull.app.BuildConfig
import com.exoskull.app.data.local.db.ExoSkullDatabase
import com.exoskull.app.data.remote.api.ExoSkullApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): ExoSkullDatabase {
        return Room.databaseBuilder(
            context,
            ExoSkullDatabase::class.java,
            "exoskull.db"
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG)
                        HttpLoggingInterceptor.Level.BODY
                    else
                        HttpLoggingInterceptor.Level.NONE
                }
            )
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        val baseUrl = BuildConfig.API_BASE_URL.ifEmpty {
            "https://exoskull.vercel.app"
        }
        return Retrofit.Builder()
            .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideExoSkullApi(retrofit: Retrofit): ExoSkullApi {
        return retrofit.create(ExoSkullApi::class.java)
    }

    @Provides
    fun provideTaskDao(database: ExoSkullDatabase) = database.taskDao()

    @Provides
    fun provideMessageDao(database: ExoSkullDatabase) = database.messageDao()

    @Provides
    fun provideConversationDao(database: ExoSkullDatabase) = database.conversationDao()

    @Provides
    fun provideHealthMetricDao(database: ExoSkullDatabase) = database.healthMetricDao()

    @Provides
    fun provideSyncQueueDao(database: ExoSkullDatabase) = database.syncQueueDao()
}
