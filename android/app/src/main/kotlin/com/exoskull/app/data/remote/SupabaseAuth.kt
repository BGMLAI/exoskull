package com.exoskull.app.data.remote

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.exoskull.app.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupabaseAuth @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val supabase = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
    ) {
        install(Auth)
        install(Postgrest)
    }

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "exoskull_auth",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    suspend fun signIn(email: String, password: String) {
        supabase.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
        // Store access token
        val session = supabase.auth.currentSessionOrNull()
        session?.let {
            prefs.edit()
                .putString("access_token", it.accessToken)
                .putString("refresh_token", it.refreshToken)
                .apply()
        }
    }

    suspend fun signOut() {
        supabase.auth.signOut()
        prefs.edit().clear().apply()
    }

    fun getAccessToken(): String? {
        return supabase.auth.currentAccessTokenOrNull()
            ?: prefs.getString("access_token", null)
    }

    fun getBearerToken(): String {
        val token = getAccessToken() ?: throw IllegalStateException("Not authenticated")
        return "Bearer $token"
    }

    suspend fun isLoggedIn(): Boolean {
        return try {
            supabase.auth.currentSessionOrNull() != null ||
                prefs.getString("access_token", null) != null
        } catch (_: Exception) {
            false
        }
    }

    fun getSupabaseClient() = supabase
}
