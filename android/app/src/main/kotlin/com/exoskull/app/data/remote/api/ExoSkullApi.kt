package com.exoskull.app.data.remote.api

import com.exoskull.app.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface ExoSkullApi {

    // ── Delta Sync ──
    @GET("api/mobile/sync")
    suspend fun sync(
        @Header("Authorization") auth: String,
        @Query("tables") tables: String,
        @Query("since") since: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 500,
    ): Response<SyncResponse>

    // ── Push Registration ──
    @POST("api/mobile/push/register")
    suspend fun registerPushToken(
        @Header("Authorization") auth: String,
        @Body body: PushTokenRequest,
    ): Response<SuccessResponse>

    @HTTP(method = "DELETE", path = "api/mobile/push/register", hasBody = true)
    suspend fun unregisterPushToken(
        @Header("Authorization") auth: String,
        @Body body: PushTokenDeleteRequest,
    ): Response<SuccessResponse>

    // ── Chat ──
    @POST("api/gateway/android")
    suspend fun sendMessage(
        @Header("Authorization") auth: String,
        @Body body: SendMessageRequest,
    ): Response<SendMessageResponse>
}
