package com.exoskull.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exoskull.app.data.local.dao.MessageDao
import com.exoskull.app.data.local.dao.TaskDao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalTime
import javax.inject.Inject

data class DashboardUiState(
    val greeting: String? = null,
    val activeTasks: Int = 0,
    val todaySteps: Int = 0,
    val todayMessages: Int = 0,
    val lastSync: String? = null,
    val isLoading: Boolean = true,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val taskDao: TaskDao,
    private val messageDao: MessageDao,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    private fun loadDashboard() {
        val hour = LocalTime.now().hour
        val greeting = when {
            hour < 12 -> "Good morning"
            hour < 18 -> "Good afternoon"
            else -> "Good evening"
        }

        viewModelScope.launch {
            // Count active tasks
            taskDao.getTasksByStatus("active").collect { tasks ->
                _uiState.value = _uiState.value.copy(
                    greeting = greeting,
                    activeTasks = tasks.size,
                    isLoading = false,
                )
            }
        }

        viewModelScope.launch {
            messageDao.getRecentMessages(50).collect { messages ->
                _uiState.value = _uiState.value.copy(
                    todayMessages = messages.size,
                )
            }
        }
    }
}
