package com.exoskull.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exoskull.app.data.local.dao.SyncQueueDao
import com.exoskull.app.data.remote.SupabaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val syncStatus: String = "Unknown",
    val pendingSyncCount: Int = 0,
    val onDeviceAiEnabled: Boolean = false,
    val healthConnectEnabled: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
    private val auth: SupabaseAuth,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettings()
    }

    private fun loadSettings() {
        viewModelScope.launch {
            val pendingCount = syncQueueDao.count()
            _uiState.value = _uiState.value.copy(
                syncStatus = if (pendingCount == 0) "Up to date" else "$pendingCount pending",
                pendingSyncCount = pendingCount,
            )
        }
    }

    fun signOut() {
        viewModelScope.launch {
            auth.signOut()
        }
    }
}
